import { OpenAI } from "openai";
import type { GeneratedTool } from "./registry.js";

interface SynthesisRequest {
  description: string;
  exampleInput?: string;
  exampleOutput?: string;
}

// Blocked patterns for security
const BLOCKED_PATTERNS = [
  /process\./,
  /require\s*\(/,
  /import\s+/,
  /eval\s*\(/,
  /Function\s*\(/,
  /while\s*\(\s*true\s*\)/,
  /for\s*\(\s*;\s*;\s*\)/,
  /globalThis/,
  /Deno\./,
  /Bun\./,
];

const SYSTEM_PROMPT = `You are a tool generator. Given a capability description, produce a complete tool definition as a single JSON object with NO other text, NO markdown fences, NO explanation.

Required fields:
{
  "name": "snake_case_tool_name",
  "description": "Clear one-line description",
  "inputSchema": {
    "type": "object",
    "properties": { "param": { "type": "string|number|boolean", "description": "..." } },
    "required": ["param"]
  },
  "handlerCode": "var result = params.x + params.y; return { sum: result };"
}

handlerCode rules:
- Receives a "params" object matching inputSchema
- Self-contained function body (no imports, no require, no fetch)
- Available globals: Math, Date, JSON, Array, Object, String, Number, RegExp, Map, Set, parseInt, parseFloat
- NOT available: fs, http, fetch, process, eval, Function, require, import
- Must return a value
- Use var/let, not const for top-level (some sandboxes are strict)
- Use regular strings, NOT template literals
- Keep under 80 lines
- Handle edge cases (missing params, division by zero, etc.)`;

export class Synthesizer {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, baseUrl: string, model: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/EyeSeeThru/jit-tool-synthesis",
        "X-Title": "JIT Tool Synthesis",
      },
    });
    this.model = model;
  }

  async generate(request: SynthesisRequest): Promise<GeneratedTool> {
    var userPrompt = "Generate a tool for: " + request.description;
    if (request.exampleInput) userPrompt += "\n\nExample input: " + request.exampleInput;
    if (request.exampleOutput) userPrompt += "\nExpected output: " + request.exampleOutput;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 2048,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const text = response.choices[0]?.message?.content || "";
    const tool = this.parseToolJson(text);
    this.validateTool(tool);
    return tool;
  }

  private parseToolJson(text: string): GeneratedTool {
    var cleaned = text.trim();

    // Strip markdown code fences
    cleaned = cleaned.replace(/^```(?:json)?\s*/g, "").replace(/\s*```$/g, "");

    // Find the JSON object — match balanced braces
    var depth = 0;
    var start = -1;
    var end = -1;
    for (var i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (cleaned[i] === "}") {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }

    if (start === -1 || end === -1) {
      throw new Error("No valid JSON object found in LLM response");
    }

    return JSON.parse(cleaned.substring(start, end + 1));
  }

  private validateTool(tool: GeneratedTool): void {
    if (!tool.name || typeof tool.name !== "string") {
      throw new Error("Generated tool missing 'name'");
    }
    if (!tool.description || typeof tool.description !== "string") {
      throw new Error("Generated tool missing 'description'");
    }
    if (!tool.inputSchema || typeof tool.inputSchema !== "object") {
      throw new Error("Generated tool missing 'inputSchema'");
    }
    if (!tool.handlerCode || typeof tool.handlerCode !== "string") {
      throw new Error("Generated tool missing 'handlerCode'");
    }

    // Check for dangerous patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(tool.handlerCode)) {
        throw new Error(
          "Generated code contains blocked pattern: " + pattern.source
        );
      }
    }

    // Verify the code at least parses
    try {
      new Function("params", tool.handlerCode);
    } catch (e) {
      throw new Error(
        "Generated code has syntax errors: " +
        (e instanceof Error ? e.message : String(e))
      );
    }
  }
}
