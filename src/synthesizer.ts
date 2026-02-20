// @ts-ignore - OpenAI types issue
import { OpenAI } from "openai";

interface SynthesisRequest {
  description: string;
  exampleInput?: string;
  exampleOutput?: string;
}

export interface GeneratedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handlerCode: string;
}

const SYSTEM_PROMPT = `You are a tool generator. Given a description of a capability,
you produce a complete tool definition.

You MUST respond with valid JSON containing exactly these fields:

{
  "name": "snake_case_tool_name",
  "description": "Clear one-line description of what the tool does",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param_name": { "type": "string|number|boolean|array|object", "description": "..." }
    },
    "required": ["param_name"]
  },
  "handlerCode": "... JavaScript function body ..."
}

Rules for handlerCode:
- It receives a 'params' object matching the inputSchema
- It must be a self-contained function body (no imports, no require)
- It has access to: Math, Date, JSON, Array, Object, String, Number, RegExp, Map, Set
- It does NOT have access to: fs, http, fetch, process, eval, Function constructor
- It must return a value (object, string, number, array)
- Keep it focused and under 100 lines

Example — for "Calculate body mass index":
{
  "name": "bmi_calculator",
  "description": "Calculate BMI from weight (kg) and height (m)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "weight_kg": { "type": "number", "description": "Weight in kilograms" },
      "height_m": { "type": "number", "description": "Height in meters" }
    },
    "required": ["weight_kg", "height_m"]
  },
  "handlerCode": "const bmi = params.weight_kg / (params.height_m ** 2); const category = bmi < 18.5 ? 'underweight' : bmi < 25 ? 'normal' : bmi < 30 ? 'overweight' : 'obese'; return { bmi: Math.round(bmi * 10) / 10, category };"
}`;

export class Synthesizer {
  // @ts-ignore - OpenAI types issue
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    // @ts-ignore - OpenAI types issue
    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/EyeSeeThru/jit-tool-synthesis",
        "X-Title": "JIT Tool Synthesis",
      },
    });
    this.model = model;
  }

  async generate(request: SynthesisRequest): Promise<GeneratedTool> {
    let userPrompt = `Generate a tool for: ${request.description}`;
    if (request.exampleInput) userPrompt += `\n\nExample input: ${request.exampleInput}`;
    if (request.exampleOutput) userPrompt += `\nExpected output format: ${request.exampleOutput}`;

    // @ts-ignore - OpenAI types issue
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 2048,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    // @ts-ignore - OpenAI types issue
    const text = response.choices[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Synthesizer did not return valid JSON");

    const tool = JSON.parse(jsonMatch[0]) as GeneratedTool;
    if (!tool.name || !tool.description || !tool.inputSchema || !tool.handlerCode) {
      throw new Error("Generated tool is missing required fields");
    }
    return tool;
  }
}
