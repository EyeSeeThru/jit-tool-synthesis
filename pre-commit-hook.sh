#!/bin/bash
# Pre-commit hook to scan for secrets

echo "🔍 Scanning for secrets..."

# Patterns that indicate personal info
PATTERNS=(
  "sk-or-v1-"
  "sk-ant-"
  "sk-proj-"
  "ghp_"
  "gho_"
  "/Users/estm/"
  "Second Brain"
  "eyeseethru"
  "openclaw-"
)

# Files to check (staged changes)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

FOUND=0

for pattern in "${PATTERNS[@]}"; do
  if echo "$STAGED_FILES" | xargs git diff --cached -S"$pattern" -p 2>/dev/null | grep -q "$pattern"; then
    echo "❌ BLOCKED: Found '$pattern' in staged files"
    FOUND=1
  fi
done

if [ $FOUND -eq 1 ]; then
  echo ""
  echo "⚠️  Commit blocked due to potential secrets"
  echo "Remove personal info and try again"
  exit 1
fi

echo "✅ No secrets detected"
exit 0
