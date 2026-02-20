import { GeneratedTool } from "./registry.js";

export class ApprovalQueue {
  private pending = new Map<string, GeneratedTool>();

  add(tool: GeneratedTool): void { this.pending.set(tool.name, tool); }
  approve(name: string): GeneratedTool | undefined {
    const tool = this.pending.get(name);
    if (tool) this.pending.delete(name);
    return tool;
  }
  reject(name: string): boolean { return this.pending.delete(name); }
  listPending(): GeneratedTool[] { return Array.from(this.pending.values()); }
  get(name: string): GeneratedTool | undefined { return this.pending.get(name); }
}
