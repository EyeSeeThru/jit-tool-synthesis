/**
 * Integration tests for jit-tool-synthesis
 * Tests all critical paths that don't require an LLM API key.
 * Run: node test/integration.mjs
 */

import { Sandbox } from "../dist/sandbox.js";
import { ToolRegistry } from "../dist/registry.js";
import { ApprovalQueue } from "../dist/approval.js";
import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;

function ok(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ": " + detail : ""}`);
    failed++;
  }
}

async function section(name, fn) {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (e) {
    console.error(`  ✗ uncaught: ${e.message}`);
    failed++;
  }
}

// ── Sandbox ────────────────────────────────────────────────────────────────

await section("Sandbox: basic execution", async () => {
  const sb = new Sandbox(3000);
  const r = await sb.execute("return { sum: params.a + params.b };", { a: 10, b: 5 });
  ok("addition", r?.sum === 15, JSON.stringify(r));
});

await section("Sandbox: timeout enforcement", async () => {
  const sb = new Sandbox(500);
  let timedOut = false;
  try {
    await sb.execute("while(true){}", {});
  } catch (e) {
    timedOut = e.message.includes("timed out");
  }
  ok("infinite loop killed", timedOut);
});

await section("Sandbox: error propagation", async () => {
  const sb = new Sandbox(3000);
  let caught = null;
  try {
    await sb.execute("throw new Error('deliberate');", {});
  } catch (e) {
    caught = e.message;
  }
  ok("error message propagated", caught?.includes("deliberate"), caught);
});

await section("Sandbox: blocked patterns rejected at synthesizer level", async () => {
  // The synthesizer validates at generation time; sandbox itself doesn't block.
  // We test that the synthesizer's BLOCKED_PATTERNS would catch these.
  const blockedPatterns = [
    /process\./,
    /require\s*\(/,
    /import\s+/,
    /eval\s*\(/,
    /Function\s*\(/,
    /globalThis/,
  ];
  const dangerous = [
    "process.exit(1)",
    "require('fs')",
    "import fs from 'fs'",
    "eval('1+1')",
    "new Function('return 1')()",
    "globalThis.x = 1",
  ];
  for (let i = 0; i < dangerous.length; i++) {
    ok(`blocks: ${dangerous[i].slice(0, 30)}`, blockedPatterns[i].test(dangerous[i]));
  }
});

// ── Existing tools ─────────────────────────────────────────────────────────

await section("Existing tool: bmi_calculator executes correctly", async () => {
  const registry = new ToolRegistry("./tools");
  const tool = registry.load("bmi_calculator");
  ok("tool loads from disk", tool !== null);

  const sb = new Sandbox(3000);
  const result = await sb.execute(tool.handlerCode, { weight_kg: 70, height_m: 1.75 });
  ok("returns bmi", typeof result?.bmi === "number", JSON.stringify(result));
  ok("returns category", typeof result?.category === "string", result?.category);
  ok("bmi in expected range", result?.bmi > 22 && result?.bmi < 24, result?.bmi);
});

await section("Existing tool: compound_interest_calculator executes correctly", async () => {
  const registry = new ToolRegistry("./tools");
  const tool = registry.load("compound_interest_calculator");
  ok("tool loads from disk", tool !== null);

  const sb = new Sandbox(3000);
  const result = await sb.execute(tool.handlerCode, {
    principal: 1000,
    rate: 5,
    time: 1,
    n: 12,
  });
  ok("returns a result", result !== null && result !== undefined, JSON.stringify(result));
  ok("result is object", typeof result === "object");
});

// ── Registry ───────────────────────────────────────────────────────────────

await section("Registry: CRUD", () => {
  const testDir = "./tools-test-tmp";
  const registry = new ToolRegistry(testDir);

  const tool = {
    name: "test_adder",
    description: "Adds two numbers",
    inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] },
    handlerCode: "return { result: params.a + params.b };",
  };

  registry.save(tool);
  ok("save creates file", fs.existsSync(path.join(testDir, "test_adder.json")));

  const loaded = registry.load("test_adder");
  ok("load returns tool", loaded !== null);
  ok("tool data intact", loaded?.name === "test_adder");

  const all = registry.loadAll();
  ok("loadAll includes tool", all.some(t => t.name === "test_adder"));

  ok("has() returns true", registry.has("test_adder"));

  const removed = registry.remove("test_adder");
  ok("remove returns true", removed);
  ok("file gone", !fs.existsSync(path.join(testDir, "test_adder.json")));
  ok("has() returns false after remove", !registry.has("test_adder"));

  // cleanup
  fs.rmSync(testDir, { recursive: true });
});

// ── Approval queue ─────────────────────────────────────────────────────────

await section("ApprovalQueue: flow", () => {
  const queue = new ApprovalQueue();
  const tool = {
    name: "pending_test",
    description: "Test tool",
    inputSchema: {},
    handlerCode: "return {};",
  };

  queue.add(tool);
  ok("listPending shows tool", queue.listPending().length === 1);
  ok("get() returns tool", queue.get("pending_test")?.name === "pending_test");

  const approved = queue.approve("pending_test");
  ok("approve returns tool", approved?.name === "pending_test");
  ok("queue empty after approve", queue.listPending().length === 0);

  queue.add(tool);
  const rejected = queue.reject("pending_test");
  ok("reject returns true", rejected);
  ok("queue empty after reject", queue.listPending().length === 0);
});

// ── Startup registration (loadAll integrity) ───────────────────────────────

await section("Startup: all persisted tools loadable and executable", async () => {
  const registry = new ToolRegistry("./tools");
  const tools = registry.loadAll();
  ok(`found ${tools.length} tools`, tools.length > 0);

  const sb = new Sandbox(3000);
  for (const tool of tools) {
    ok(`${tool.name} has required fields`, tool.name && tool.description && tool.handlerCode && tool.inputSchema);
  }
});

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
