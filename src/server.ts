import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Synthesizer } from "./synthesizer.js";
import { ToolRegistry, GeneratedTool } from "./registry.js";
import { ApprovalQueue } from "./approval.js";
import { Sandbox } from "./sandbox.js";

const registry = new ToolRegistry("./tools");
const approvals = new ApprovalQueue();
const sandbox = new Sandbox();

const synthesizer = new Synthesizer(
  process.env.OPENROUTER_API_KEY!,
  process.env.SYNTHESIZER_MODEL || "openrouter/anthropic/claude-3-5-sonnet-20241022"
);

const server = new McpServer({
  name: "jit-tool-synthesis",
  version: "2.0.0",
});

// Meta-tool: generate a new tool
server.registerTool(
  "synthesize_tool",
  {
    title: "Synthesize a new tool",
    description:
      "Describe a capability you need and this will generate a working tool. " +
      "Returns a pending tool that needs approval before it becomes available.",
    inputSchema: {
      description: z.string().describe("What the tool should do"),
      example_input: z.string().optional().describe("Example input to guide generation"),
      example_output: z.string().optional().describe("Expected output format"),
    },
  },
  async ({ description, example_input, example_output }) => {
    const pending = await synthesizer.generate({
      description,
      exampleInput: example_input,
      exampleOutput: example_output,
    });

    approvals.add(pending);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: "pending_approval",
              tool: {
                name: pending.name,
                description: pending.description,
                parameters: pending.inputSchema,
              },
              message: `Tool "${pending.name}" generated. Call approve_tool to activate it.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// List all available tools
server.registerTool(
  "list_tools",
  {
    title: "List all available tools",
    description: "Returns a list of all approved and available tools",
    inputSchema: {},
  },
  async () => {
    const tools = registry.list();
    return {
      content: [{ type: "text", text: JSON.stringify({ tools }, null, 2) }],
    };
  }
);

// Approve a pending tool
server.registerTool(
  "approve_tool",
  {
    title: "Approve a synthesized tool",
    inputSchema: {
      tool_name: z.string(),
    },
  },
  async ({ tool_name }) => {
    const pending = approvals.approve(tool_name);
    if (!pending) {
      return { content: [{ type: "text", text: `No pending tool "${tool_name}" found.` }] };
    }
    registry.save(pending);
    return {
      content: [{ type: "text", text: `Tool "${tool_name}" approved and saved.` }],
    };
  }
);

// Reject a pending tool
server.registerTool(
  "reject_tool",
  {
    title: "Reject a synthesized tool",
    inputSchema: {
      tool_name: z.string(),
    },
  },
  async ({ tool_name }) => {
    const rejected = approvals.reject(tool_name);
    return {
      content: [
        {
          type: "text",
          text: rejected
            ? `Tool "${tool_name}" rejected.`
            : `No pending tool "${tool_name}" found.`,
        },
      ],
    };
  }
);

// Execute an approved tool
server.registerTool(
  "execute_tool",
  {
    title: "Execute an approved tool",
    inputSchema: {
      tool_name: z.string(),
      params: z.record(z.unknown()),
    },
  },
  async ({ tool_name, params }) => {
    const tool = registry.load(tool_name);
    if (!tool) {
      return { content: [{ type: "text", text: `Tool "${tool_name}" not found.` }] };
    }
    try {
      const result = await sandbox.execute(tool.handlerCode, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Get tool details
server.registerTool(
  "get_tool",
  {
    title: "Get tool details",
    inputSchema: {
      tool_name: z.string(),
    },
  },
  async ({ tool_name }) => {
    const tool = registry.load(tool_name);
    if (!tool) {
      return { content: [{ type: "text", text: `Tool "${tool_name}" not found.` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(tool, null, 2) }] };
  }
);

// Remove a tool
server.registerTool(
  "remove_tool",
  {
    title: "Remove an approved tool",
    inputSchema: {
      tool_name: z.string(),
    },
  },
  async ({ tool_name }) => {
    const removed = registry.remove(tool_name);
    return {
      content: [
        {
          type: "text",
          text: removed ? `Tool "${tool_name}" removed.` : `Tool "${tool_name}" not found.`,
        },
      ],
    };
  }
);

// List pending tools
server.registerTool(
  "list_pending",
  {
    title: "List pending tools",
    description: "Returns a list of tools waiting for approval",
    inputSchema: {},
  },
  async () => {
    const pending = approvals.listPending();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { pending: pending.map((t) => ({ name: t.name, description: t.description })) },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
