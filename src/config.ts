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
    // Load baseUrl and model from file if exists
    // API key ALWAYS comes from env vars - never from disk
    let fileConfig = { baseUrl: "", model: "" };
    if (fs.existsSync(this.configPath)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        fileConfig = { 
          baseUrl: loaded.baseUrl || "", 
          model: loaded.model || "" 
        };
      } catch {
        // Ignore - use defaults
      }
    }
    return {
      apiKey: process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "",
      baseUrl: fileConfig.baseUrl || process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
      model: fileConfig.model || process.env.LLM_MODEL || process.env.SYNTHESIZER_MODEL || "anthropic/claude-sonnet-4-6",
    };
  }

  get(): LLMConfig {
    return { ...this.config };
  }

  set(newConfig: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...newConfig };
    // Never persist API key to disk - always read from env
    const { apiKey, ...safeConfig } = this.config;
    fs.writeFileSync(this.configPath, JSON.stringify(safeConfig, null, 2));
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
