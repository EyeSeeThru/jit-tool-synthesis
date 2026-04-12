import { workerData, parentPort } from "node:worker_threads";
import vm from "node:vm";

const ALLOWED_GLOBALS = {
  Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set,
  parseInt, parseFloat, isNaN, isFinite, undefined, NaN, Infinity,
  console: { log: () => {}, warn: () => {}, error: () => {} },
};

const { code, params } = workerData as { code: string; params: Record<string, unknown> };

try {
  const wrappedCode = `(function(params) { "use strict"; ${code} })`;
  const context = vm.createContext({ ...ALLOWED_GLOBALS });
  const script = new vm.Script(wrappedCode, { filename: "generated-tool.js" });
  const handler = script.runInContext(context, { timeout: 3000 });
  const result = handler(params);

  if (result !== null && typeof result === "object" && typeof (result as any).then === "function") {
    (result as Promise<unknown>).then(
      (r) => parentPort!.postMessage({ result: r }),
      (e: unknown) => parentPort!.postMessage({ error: e instanceof Error ? e.message : String(e) })
    );
  } else {
    parentPort!.postMessage({ result });
  }
} catch (e) {
  parentPort!.postMessage({ error: e instanceof Error ? e.message : String(e) });
}
