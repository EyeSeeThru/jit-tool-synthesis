import vm from "node:vm";

const ALLOWED_GLOBALS = {
  Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set,
  parseInt, parseFloat, isNaN, isFinite, undefined, NaN, Infinity,
  console: { log: () => {}, warn: () => {}, error: () => {} },
};

export class Sandbox {
  constructor(private timeoutMs = 5000) {}

  async execute(handlerCode: string, params: Record<string, unknown>): Promise<unknown> {
    const wrappedCode = `(function(params) { "use strict"; ${handlerCode} })`;
    const context = vm.createContext({ ...ALLOWED_GLOBALS });

    try {
      const script = new vm.Script(wrappedCode, { filename: "generated-tool.js" });
      const handler = script.runInContext(context, { timeout: this.timeoutMs });
      const result = handler(params);

      if (result instanceof Promise) {
        return await Promise.race([
          result,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Async timeout")), this.timeoutMs)
          ),
        ]);
      }
      return result;
    } catch (error) {
      throw new Error(
        `Execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
