#!/usr/bin/env bash
# Render build step: writes config.js from the TMDB_KEY environment variable.
set -euo pipefail

if [ -z "${TMDB_KEY:-}" ]; then
  echo "TMDB_KEY is not set. Add it under Environment in Render." >&2
  exit 1
fi

cat > config.js <<EOF
window.CONFIG = { TMDB_KEY: "${TMDB_KEY}", REGION: "${REGION:-}" };
EOF

echo "config.js written"
