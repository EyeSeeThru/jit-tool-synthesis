#!/bin/bash
# Wrapper script for JIT Tool Synthesis MCP server

export OPENROUTER_API_KEY="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"
export SYNTHESIZER_MODEL="anthropic/claude-3-5-sonnet-20241022"

cd /Users/estm/.openclaw/workspace/jit-tool-synthesis
exec node dist/server.js "$@"
