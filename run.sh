#!/bin/bash
# Wrapper script for JIT Tool Synthesis MCP server
# Supports LLM_* vars (preferred) with fallback to legacy OPENROUTER_*/OPENAI_* vars

export LLM_API_KEY="${LLM_API_KEY:-${OPENROUTER_API_KEY:-${OPENAI_API_KEY}}}"
export LLM_BASE_URL="${LLM_BASE_URL:-${OPENAI_BASE_URL:-https://openrouter.ai/api/v1}}"
export LLM_MODEL="${LLM_MODEL:-${SYNTHESIZER_MODEL:-anthropic/claude-3-5-sonnet-20241022}}"

cd "$(dirname "$0")"
exec node dist/server.js "$@"
