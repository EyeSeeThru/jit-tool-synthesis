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
| `synthesizer.ts` | Generates tool code using any OpenAI-compatible LLM |
| `approval.ts` | Human-in-the-loop gate — requires approval before execution |
| `sandbox.ts` | Safe execution environment for generated code |
| `registry.ts` | Tool persistence and storage |
| `server.ts` | MCP server integration |
| `config.ts` | Runtime configuration management |

## Provider-Agnostic

This tool works with **any** OpenAI-compatible LLM API:

- **OpenRouter** — 100+ models (Claude, GPT, Llama, etc.)
- **OpenAI** — GPT-5.4, Codex 5.3
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
LLM_MODEL=anthropic/claude-4-5-sonnet

# Option 2: OpenAI direct
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o

# Option 3: Ollama (local)
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1

# Option 4: Groq
LLM_API_KEY=gsk_...
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-70b-versatile
```

## Usage

### Start the MCP Server

```bash
npm run build
node dist/server.js
```

### Runtime Configuration

You can change the LLM provider without restarting:

```bash
# View current config
get_config

# Change model at runtime
set_config model=openai/gpt-4o
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `synthesize_tool` | Generate a new tool from natural language |
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

1. **Request** — User asks for a tool (e.g., "create a weather fetcher")
2. **Synthesize** — LLM generates tool code
3. **Approve** — Human reviews and approves the code
4. **Execute** — Tool runs in sandboxed environment
5. **Store** — Approved tools persist in registry

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_API_KEY` | API key for your provider | (required for cloud) |
| `LLM_BASE_URL` | API endpoint | https://openrouter.ai/api/v1 |
| `LLM_MODEL` | Model to use | anthropic/claude-3-5-sonnet-20241022 |

Also supported (legacy): `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `SYNTHESIZER_MODEL`

## Security

- Generated code runs in isolated VM sandbox
- Blocked patterns prevent dangerous code (process, require, eval, etc.)
- API keys not stored in config file

## Status

**Production Ready** — Phase 1 complete.
