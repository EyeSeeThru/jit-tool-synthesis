# JIT Tool Synthesis v2

LLM-powered on-demand tool generation with human-in-the-loop approval and safe execution.

## Overview

This system generates TypeScript tools dynamically using an LLM, requires human approval before execution, and runs them in a sandboxed environment.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Synthesizer │────▶│   Approval   │────▶│  Sandbox    │
│   (LLM)     │     │ (Human Gate) │     │ (Execution) │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │                    │
       ▼                   ▼                    ▼
  Generates TS        Waits for            Runs in
  tool code          human approval       isolated env
```

## Components

| File | Purpose |
|------|---------|
| `synthesizer.ts` | Generates TypeScript code using OpenRouter LLM |
| `approval.ts` | Human-in-the-loop gate — requires approval before execution |
| `sandbox.ts` | Safe execution environment for generated code |
| `registry.ts` | Tool persistence and storage |
| `server.ts` | MCP server integration |

## Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Add your OpenRouter API key to .env
OPENROUTER_API_KEY=your_key_here
```

## Usage

### Start the MCP Server

```bash
npm run dev
```

### Claude Desktop Integration

Import the config:

```bash
# Copy Claude Desktop config
cat claude-desktop-config.json
```

Add the JSON to your Claude Desktop settings under `mcpServers`.

### CLI Commands

```bash
# Generate and approve a tool
npm run cli -- synthesize "Create a weather tool that fetches from wttr.in"

# List available tools
npm run cli -- list

# Execute a tool
npm run cli -- execute <tool-id>
```

## Workflow

1. **Request** — User asks for a tool (e.g., "create a weather fetcher")
2. **Synthesize** — LLM generates TypeScript code
3. **Approve** — Human reviews and approves the code
4. **Execute** — Tool runs in sandboxed environment
5. **Store** — Approved tools persist in registry

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | API key for LLM tool generation |
| `PORT` | Server port (default: 3000) |

## Status

**In Progress** — MVP complete, end-to-end testing in progress.
