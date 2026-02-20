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

IMPORTANT: handlerCode must be a regular string, NOT a template literal. Use regular quotes " and escape any quotes inside with \\". Do NOT use backticks.

Rules for handlerCode:
- It receives a 'params' object matching the inputSchema
- It must be a self-contained function body (no imports, no require)
- It has access to: Math, Date, JSON, Array, Object, String, Number, RegExp, Map, Set
- It does NOT have access to: fs, http, fetch, process, eval, Function constructor
- It must return a value (object, string, number, array)
- Keep it focused and under 100 lines

Example — for "Calculate body mass index":
{"name":"bmi_calculator","description":"Calculate BMI from weight (kg) and height (m)","inputSchema":{"type":"object","properties":{"weight_kg":{"type":"number","description":"Weight in kilograms"},"height_m":{"type":"number","description":"Height in meters"}},"required":["weight_kg","height_m"]},"handlerCode":"var bmi = params.weight_kg / (params.height_m * params.height_m); var category = bmi < 18.5 ? 'underweight' : bmi < 25 ? 'normal' : bmi < 30 ? 'overweight' : 'obese'; return { bmi: Math.round(bmi * 10) / 10, category: category };"}`;

export class Synthesizer {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(request: SynthesisRequest): Promise<GeneratedTool> {
    let userPrompt = `Generate a tool for: ${request.description}`;
    if (request.exampleInput) userPrompt += `\n\nExample input: ${request.exampleInput}`;
    if (request.exampleOutput) userPrompt += `\nExpected output format: ${request.exampleOutput}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/EyeSeeThru/jit-tool-synthesis",
        "X-Title": "JIT Tool Synthesis",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    const text = data.choices[0]?.message?.content || "";
    
    // Try to extract JSON from response
    let jsonStr = text.trim();
    
    // Remove markdown code fences
    jsonStr = jsonStr.replace(/^```json\s*/g, "").replace(/^```\s*/g, "").replace(/```$/g, "");
    
    // Try to find JSON object
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("Synthesizer did not return valid JSON");
    }
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);

    const tool = JSON.parse(jsonStr) as GeneratedTool;
    if (!tool.name || !tool.description || !tool.inputSchema || !tool.handlerCode) {
      throw new Error("Generated tool is missing required fields");
    }
    return tool;
  }
}
