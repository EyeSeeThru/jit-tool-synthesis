#!/bin/bash
# Wrapper script for JIT Tool Synthesis MCP server

export OPENROUTER_API_KEY="${OPENROUTER_API_KEY}"
export SYNTHESIZER_MODEL="${SYNTHESIZER_MODEL:-anthropic/claude-3-5-sonnet-20241022}"

cd "$(dirname "$0")"
exec node dist/server.js "$@"
