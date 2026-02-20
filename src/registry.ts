import fs from "node:fs";
import path from "node:path";

export interface GeneratedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handlerCode: string;
}

export class ToolRegistry {
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  save(tool: GeneratedTool): void {
    fs.writeFileSync(path.join(this.dir, `${tool.name}.json`), JSON.stringify(tool, null, 2));
  }

  load(name: string): GeneratedTool | null {
    const filePath = path.join(this.dir, `${name}.json`);
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : null;
  }

  loadAll(): GeneratedTool[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter(f => f.endsWith(".json"))
      .map(f => JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf-8")));
  }

  remove(name: string): boolean {
    const filePath = path.join(this.dir, `${name}.json`);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  list(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter(f => f.endsWith(".json"))
      .map(f => f.replace(".json", ""));
  }
}
