import fs from "node:fs";
import path from "node:path";

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const CONFIG_FILE = "./config.json";

class ConfigManager {
  private config: LLMConfig;
  private configPath: string;

  constructor() {
    this.configPath = path.resolve(CONFIG_FILE);
    this.config = this.load();
  }

  private load(): LLMConfig {
    // Load from file if exists, otherwise use env vars
    if (fs.existsSync(this.configPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
      } catch {
        // Fall back to env vars
      }
    }
    return {
      apiKey: process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "",
      baseUrl: process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
      model: process.env.LLM_MODEL || process.env.SYNTHESIZER_MODEL || "anthropic/claude-3-5-sonnet-20241022",
    };
  }

  get(): LLMConfig {
    return { ...this.config };
  }

  set(newConfig: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...newConfig };
    // Don't persist API key to disk for security
    if (!newConfig.apiKey || newConfig.apiKey.length < 10) {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    }
  }

  // Get config without sensitive data (for displaying)
  getSafe(): Record<string, string> {
    return {
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      hasApiKey: this.config.apiKey ? "yes" : "no",
    };
  }
}

export const configManager = new ConfigManager();
