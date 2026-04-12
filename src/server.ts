import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Synthesizer } from "./synthesizer.js";
import { ToolRegistry, GeneratedTool } from "./registry.js";
import { ApprovalQueue } from "./approval.js";
import { Sandbox } from "./sandbox.js";
import { configManager } from "./config.js";

// Initialize config
const config = configManager.get();
if (!config.apiKey) {
  console.error("No API key found. Set LLM_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY.");
  process.exit(1);
}

const registry = new ToolRegistry("./tools");
const approvals = new ApprovalQueue();
const sandbox = new Sandbox();
const synthesizer = new Synthesizer(config.apiKey, config.baseUrl, config.model);

// Track dynamically registered tools for enable/remove lifecycle
const dynamicTools = new Map<string, RegisteredTool>();

const server = new McpServer({
  name: "jit-tool-synthesis",
  version: "3.0.0",
});

// --- Dynamic tool registration helpers ---

function jsonSchemaToZodShape(schema: Record<string, unknown>): Record<string, z.ZodTypeAny> {
  const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required || []) as string[];
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let zodType: z.ZodTypeAny;
    switch (prop.type) {
      case "string":  zodType = z.string();  break;
      case "number":
      case "integer": zodType = z.number();  break;
      case "boolean": zodType = z.boolean(); break;
      case "array":   zodType = z.array(z.unknown()); break;
      case "object":  zodType = z.record(z.string(), z.unknown()); break;
      default:        zodType = z.unknown(); break;
    }
    if (typeof prop.description === "string") zodType = zodType.describe(prop.description);
    if (!required.includes(key)) zodType = zodType.optional() as z.ZodTypeAny;
    shape[key] = zodType;
  }
  return shape;
}

function registerGeneratedTool(tool: GeneratedTool): void {
  // Remove existing registration if present (re-approve scenario)
  if (dynamicTools.has(tool.name)) {
    dynamicTools.get(tool.name)!.remove();
    dynamicTools.delete(tool.name);
  }

  const shape = jsonSchemaToZodShape(tool.inputSchema);

  const registered = server.registerTool(
    tool.name,
    {
      title: tool.name,
      description: tool.description + " [generated]",
      inputSchema: shape,
    },
    async (params) => {
      try {
        const result = await sandbox.execute(tool.handlerCode, params as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  dynamicTools.set(tool.name, registered);
}

// Register all persisted tools at startup
for (const tool of registry.loadAll()) {
  registerGeneratedTool(tool);
}

// --- Meta-tools ---

server.registerTool(
  "synthesize_tool",
  {
    title: "Synthesize a new tool",
    description:
      "Generate a new tool from a natural language description. " +
      "Returns a pending tool definition for review. " +
      "Call approve_tool to activate it, or reject_tool to discard.",
    inputSchema: {
      description: z.string().describe(
        "What the tool should do, e.g. 'Convert between hex, RGB, and HSL color formats'"
      ),
      example_input: z.string().optional().describe(
        "Example input to guide generation, e.g. '{\"hex\": \"#FF6B35\"}'"
      ),
      example_output: z.string().optional().describe(
        "Expected output shape, e.g. '{\"rgb\": [255, 107, 53], \"hsl\": [16, 100, 60]}'"
      ),
    },
  },
  async ({ description, example_input, example_output }) => {
    try {
      const pending = await synthesizer.generate({
        description,
        exampleInput: example_input,
        exampleOutput: example_output,
      });
      approvals.add(pending);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "pending_approval",
            tool: {
              name: pending.name,
              description: pending.description,
              parameters: pending.inputSchema,
              code_preview: pending.handlerCode,
            },
            next_step: `Review the code above, then call approve_tool with tool_name="${pending.name}" to activate, or reject_tool to discard.`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "approve_tool",
  {
    title: "Approve a synthesized tool",
    description: "Activate a pending tool so it can be executed. Registers it as a first-class MCP tool. Use list_pending to see available tools.",
    inputSchema: {
      tool_name: z.string().describe("Name of the pending tool to approve"),
    },
  },
  async ({ tool_name }) => {
    const pending = approvals.approve(tool_name);
    if (!pending) {
      return {
        content: [{ type: "text", text: `No pending tool "${tool_name}". Use list_pending to see options.` }],
        isError: true,
      };
    }
    registry.save(pending);
    registerGeneratedTool(pending);
    return {
      content: [{
        type: "text",
        text: `Tool "${tool_name}" is now active and registered as an MCP tool. You can call it directly or use execute_tool.`,
      }],
    };
  }
);

server.registerTool(
  "reject_tool",
  {
    title: "Reject a synthesized tool",
    description: "Discard a pending tool without activating it.",
    inputSchema: {
      tool_name: z.string().describe("Name of the pending tool to reject"),
    },
  },
  async ({ tool_name }) => {
    const rejected = approvals.reject(tool_name);
    return {
      content: [{
        type: "text",
        text: rejected
          ? `Tool "${tool_name}" rejected and discarded.`
          : `No pending tool "${tool_name}" found.`,
      }],
    };
  }
);

server.registerTool(
  "execute_tool",
  {
    title: "Execute a generated tool",
    description:
      "Run an approved tool with the given parameters. " +
      "Use list_generated_tools to see available tools and get_tool to see their schemas.",
    inputSchema: {
      tool_name: z.string().describe("Name of the tool to execute"),
      params: z.record(z.unknown()).describe("Parameters matching the tool's inputSchema"),
    },
  },
  async ({ tool_name, params }) => {
    const tool = registry.load(tool_name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Tool "${tool_name}" not found. Use list_generated_tools to see available tools.` }],
        isError: true,
      };
    }
    try {
      const result = await sandbox.execute(tool.handlerCode, params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "test_tool",
  {
    title: "Test a pending tool",
    description: "Execute a pending tool with sample params to validate before approval.",
    inputSchema: {
      tool_name: z.string().describe("Name of the pending tool to test"),
      params: z.record(z.unknown()).describe("Sample parameters to test with"),
    },
  },
  async ({ tool_name, params }) => {
    const pending = approvals.get(tool_name);
    if (pending) {
      try {
        const result = await sandbox.execute(pending.handlerCode, params);
        return { content: [{ type: "text", text: JSON.stringify({ status: "success", source: "pending", result }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", source: "pending", error: error instanceof Error ? error.message : String(error) }, null, 2) }], isError: true };
      }
    }
    const tool = registry.load(tool_name);
    if (tool) {
      try {
        const result = await sandbox.execute(tool.handlerCode, params);
        return { content: [{ type: "text", text: JSON.stringify({ status: "success", source: "approved", result }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "failed", source: "approved", error: error instanceof Error ? error.message : String(error) }, null, 2) }], isError: true };
      }
    }
    return { content: [{ type: "text", text: `Tool "${tool_name}" not found.` }], isError: true };
  }
);

server.registerTool(
  "list_generated_tools",
  {
    title: "List generated tools",
    description: "Show all approved tools that have been generated and are available for execution.",
    inputSchema: {},
  },
  async () => {
    const tools = registry.loadAll();
    if (tools.length === 0) {
      return {
        content: [{ type: "text", text: "No generated tools yet. Use synthesize_tool to create one." }],
      };
    }
    const summary = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }
);

server.registerTool(
  "get_tool",
  {
    title: "Get tool details",
    description: "View full details of a generated tool including its code and parameter schema.",
    inputSchema: {
      tool_name: z.string().describe("Name of the tool to inspect"),
    },
  },
  async ({ tool_name }) => {
    const tool = registry.load(tool_name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Tool "${tool_name}" not found.` }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(tool, null, 2) }] };
  }
);

server.registerTool(
  "remove_tool",
  {
    title: "Remove a generated tool",
    description: "Permanently delete an approved tool from the registry and unregister it as an MCP tool.",
    inputSchema: {
      tool_name: z.string().describe("Name of the tool to remove"),
    },
  },
  async ({ tool_name }) => {
    const removed = registry.remove(tool_name);
    if (dynamicTools.has(tool_name)) {
      dynamicTools.get(tool_name)!.remove();
      dynamicTools.delete(tool_name);
    }
    return {
      content: [{
        type: "text",
        text: removed ? `Tool "${tool_name}" removed.` : `Tool "${tool_name}" not found.`,
      }],
    };
  }
);

server.registerTool(
  "list_pending",
  {
    title: "List pending tools",
    description: "Show tools waiting for approval.",
    inputSchema: {},
  },
  async () => {
    const pending = approvals.listPending();
    if (pending.length === 0) {
      return {
        content: [{ type: "text", text: "No tools pending approval." }],
      };
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify(
          pending.map(t => ({
            name: t.name,
            description: t.description,
            code_preview: t.handlerCode,
          })),
          null,
          2
        ),
      }],
    };
  }
);

server.registerTool(
  "get_config",
  {
    title: "Get LLM configuration",
    description: "Show current LLM provider, model, and base URL settings.",
    inputSchema: {},
  },
  async () => {
    const safe = configManager.getSafe();
    return {
      content: [{ type: "text", text: JSON.stringify(safe, null, 2) }],
    };
  }
);

server.registerTool(
  "set_config",
  {
    title: "Set LLM configuration",
    description: "Change the LLM provider, model, or base URL at runtime. Changes take effect immediately.",
    inputSchema: {
      base_url: z.string().optional().describe("Base URL, e.g. https://openrouter.ai/api/v1"),
      model: z.string().optional().describe("Model name, e.g. anthropic/claude-sonnet-4-6"),
    },
  },
  async ({ base_url, model }) => {
    const newConfig: any = {};
    if (base_url) newConfig.baseUrl = base_url;
    if (model) newConfig.model = model;

    configManager.set(newConfig);

    // Recreate synthesizer with new config
    const newCfg = configManager.get();
    synthesizer.updateConfig(newCfg.apiKey, newCfg.baseUrl, newCfg.model);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "updated",
          baseUrl: newCfg.baseUrl,
          model: newCfg.model,
        }, null, 2),
      }],
    };
  }
);

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
