/**
 * End-to-end test with a mocked LLM response.
 * Tests the full path: parse → validate → approve → register → execute.
 * The only thing not covered is the actual HTTP call to the LLM API.
 */

import { Sandbox } from "../dist/sandbox.js";
import { ToolRegistry } from "../dist/registry.js";
import { ApprovalQueue } from "../dist/approval.js";
import { Synthesizer } from "../dist/synthesizer.js";
import fs from "node:fs";

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

// ── What the LLM would return for "temperature converter" ─────────────────
// This is a realistic example of LLM output — complete with markdown fences
// that the parser must strip, matching real model behavior.

const MOCK_LLM_RESPONSE = `\`\`\`json
{
  "name": "temperature_converter",
  "description": "Convert temperature between Celsius, Fahrenheit, and Kelvin",
  "inputSchema": {
    "type": "object",
    "properties": {
      "value": { "type": "number", "description": "Temperature value to convert" },
      "from": { "type": "string", "description": "Source unit: C, F, or K" }
    },
    "required": ["value", "from"]
  },
  "handlerCode": "var v = params.value; var from = (params.from || '').toUpperCase(); var celsius; if (from === 'C') { celsius = v; } else if (from === 'F') { celsius = (v - 32) * 5 / 9; } else if (from === 'K') { celsius = v - 273.15; } else { return { error: 'Unknown unit. Use C, F, or K.' }; } return { C: Math.round(celsius * 100) / 100, F: Math.round((celsius * 9/5 + 32) * 100) / 100, K: Math.round((celsius + 273.15) * 100) / 100 };"
}
\`\`\``;

// ── Step 1: Synthesizer parses and validates the LLM response ─────────────

console.log("\nStep 1: Synthesizer parses LLM response");

const synthesizer = new Synthesizer("dummy-key", "https://unused", "unused-model");
let tool;
try {
  // Call the private methods via the public path — patch generate() to return mock
  synthesizer.generate = async () => {
    return synthesizer._parseAndValidate(MOCK_LLM_RESPONSE);
  };
  synthesizer._parseAndValidate = (text) => {
    // Access the private methods by calling them via the class internals
    const parsed = synthesizer["parseToolJson"](text);
    synthesizer["validateTool"](parsed);
    return parsed;
  };

  // Since private methods aren't accessible in JS, call generate with a stub
  // by patching the client directly
  synthesizer["client"] = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: MOCK_LLM_RESPONSE } }]
        })
      }
    }
  };

  tool = await synthesizer.generate({ description: "temperature converter" });
  ok("parse strips markdown fences", tool !== null);
  ok("tool has name", tool.name === "temperature_converter");
  ok("tool has description", typeof tool.description === "string");
  ok("tool has inputSchema", typeof tool.inputSchema === "object");
  ok("tool has handlerCode", typeof tool.handlerCode === "string");
} catch (e) {
  console.error(`  ✗ parse failed: ${e.message}`);
  failed += 5;
}

// ── Step 2: Approval queue ─────────────────────────────────────────────────

console.log("\nStep 2: Approval queue");

const approvals = new ApprovalQueue();
approvals.add(tool);
ok("tool is pending", approvals.listPending().length === 1);
const approved = approvals.approve(tool.name);
ok("approve returns tool", approved?.name === "temperature_converter");
ok("queue is empty after approve", approvals.listPending().length === 0);

// ── Step 3: Registry persistence ──────────────────────────────────────────

console.log("\nStep 3: Registry persistence");

const testDir = "./tools-e2e-tmp";
const registry = new ToolRegistry(testDir);
registry.save(approved);
const loaded = registry.load("temperature_converter");
ok("saved and loaded from disk", loaded?.name === "temperature_converter");
ok("handlerCode survives round-trip", loaded?.handlerCode === approved.handlerCode);

// ── Step 4: Sandbox execution ──────────────────────────────────────────────

console.log("\nStep 4: Sandbox executes the generated tool");

const sb = new Sandbox(3000);
const r1 = await sb.execute(loaded.handlerCode, { value: 100, from: "C" });
ok("100°C → correct F", r1?.F === 212, JSON.stringify(r1));
ok("100°C → correct K", r1?.K === 373.15, JSON.stringify(r1));

const r2 = await sb.execute(loaded.handlerCode, { value: 32, from: "F" });
ok("32°F → 0°C", r2?.C === 0, JSON.stringify(r2));

const r3 = await sb.execute(loaded.handlerCode, { value: 0, from: "K" });
ok("0K → correct C", r3?.C === -273.15, JSON.stringify(r3));

const r4 = await sb.execute(loaded.handlerCode, { value: 0, from: "X" });
ok("unknown unit returns error", r4?.error?.includes("Unknown"), JSON.stringify(r4));

// ── Step 5: Cleanup ────────────────────────────────────────────────────────

registry.remove("temperature_converter");
fs.rmSync(testDir, { recursive: true });

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
