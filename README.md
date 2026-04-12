# JIT Tool Synthesis v4

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
| `synthesizer.ts` | Generates tool code using any OpenAI-compatible LLM |
| `approval.ts` | Human-in-the-loop gate — requires approval before execution |
| `sandbox.ts` | Safe execution environment for generated code |
| `registry.ts` | Tool persistence and storage |
| `server.ts` | MCP server integration |
| `config.ts` | Runtime configuration management |

## Provider-Agnostic

This tool works with **any** OpenAI-compatible LLM API:

- **OpenRouter** — 100+ models (Claude, GPT, Llama, etc.)
- **OpenAI** — GPT-4o, o3, etc.
- **Ollama** — Local models (Llama, Qwen, etc.)
- **LM Studio** — Local models with GUI
- **Groq** — Fast inference
- **Any** other OpenAI-compatible API

## Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Configure Your LLM Provider

Edit `.env` with your provider details:

```bash
# Option 1: OpenRouter (default - 100+ models)
LLM_API_KEY=your-openrouter-key
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=anthropic/claude-sonnet-4-6

# Option 2: OpenAI direct
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-5.4

# Option 3: Ollama (local)
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama-3.3

# Option 4: Groq
LLM_API_KEY=gsk_...
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
```

## Usage

### Build

```bash
npm run build
```

### Test with MCP Inspector

The fastest way to verify everything works:

```bash
npx @modelcontextprotocol/inspector node dist/server.js
```

### Connect to MCP Clients

This server works with **any** MCP client. Example configs:

**Claude Desktop** — add to your Claude Desktop MCP settings:
```json
{
  "mcpServers": {
    "jit-tool-synthesis": {
      "command": "node",
      "args": ["/absolute/path/to/jit-tool-synthesis/dist/server.js"],
      "env": {
        "LLM_API_KEY": "your-api-key",
        "LLM_BASE_URL": "https://openrouter.ai/api/v1",
        "LLM_MODEL": "anthropic/claude-sonnet-4-6"
      }
    }
  }
}
```

**Claude Code:**
```bash
claude mcp add jit-tools node /absolute/path/to/jit-tool-synthesis/dist/server.js
```

**VS Code (Copilot):**
```bash
code --add-mcp '{"name":"jit-tools","type":"stdio","command":"node","args":["/absolute/path/to/jit-tool-synthesis/dist/server.js"]}'
```

**Cursor** — add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "jit-tools": {
      "command": "node",
      "args": ["/absolute/path/to/jit-tool-synthesis/dist/server.js"],
      "env": { "LLM_API_KEY": "your-api-key" }
    }
  }
}
```

### Runtime Configuration

You can change the LLM provider without restarting:

```bash
# View current config
get_config

# Change model at runtime
set_config model=openai/gpt-5.4
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `synthesize_tool` | Generate a new tool from natural language |
| `test_tool` | Test a pending tool with sample params before approval |
| `approve_tool` | Activate a pending tool |
| `reject_tool` | Discard a pending tool |
| `execute_tool` | Run an approved tool |
| `list_generated_tools` | List all approved tools |
| `get_tool` | View tool details |
| `remove_tool` | Delete a tool |
| `list_pending` | List tools waiting for approval |
| `get_config` | View LLM configuration |
| `set_config` | Change LLM provider/model at runtime |

## Workflow

1. **Request** — User asks for a tool (e.g., "create a color converter")
2. **Synthesize** — LLM generates tool code
3. **Test** — Validate with sample params before committing
4. **Approve** — Human reviews and approves the code
5. **Execute** — Tool runs in sandboxed environment
6. **Store** — Approved tools persist across sessions

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_API_KEY` | API key for your provider | (required for cloud) |
| `LLM_BASE_URL` | API endpoint | https://openrouter.ai/api/v1 |
| `LLM_MODEL` | Model to use | anthropic/claude-sonnet-4-6 |

Also supported (legacy): `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `SYNTHESIZER_MODEL`

## Security

- Generated code runs in isolated VM sandbox
- Blocked patterns prevent dangerous code (process, require, eval, etc.)
- API keys not stored in config file

## Status

**Production Ready** — Phase 1 complete.
