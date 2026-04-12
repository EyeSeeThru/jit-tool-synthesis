import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

const WORKER_PATH = new URL("./sandbox-worker.js", import.meta.url);

export class Sandbox {
  constructor(private timeoutMs = 5000) {}

  async execute(handlerCode: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(fileURLToPath(WORKER_PATH), {
        workerData: { code: handlerCode, params },
      });

      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error(`Execution timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      worker.on("message", (msg: { result?: unknown; error?: string }) => {
        clearTimeout(timer);
        worker.terminate();
        if (msg.error !== undefined) {
          reject(new Error(`Execution failed: ${msg.error}`));
        } else {
          resolve(msg.result);
        }
      });

      worker.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
