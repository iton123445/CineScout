#!/usr/bin/env bash
# Render build step: writes config.js from the TMDB_KEY environment variable.
set -euo pipefail

if [ -z "${TMDB_KEY:-}" ]; then
  echo "TMDB_KEY is not set. Add it under Environment in Render." >&2
  exit 1
fi

cat > config.js <<EOF
window.CONFIG = {
  TMDB_KEY: "${TMDB_KEY}",
  REGION: "${REGION:-}",
  SUPABASE_URL: "${SUPABASE_URL:-}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY:-}",
};
EOF

echo "config.js written"

# Version the asset URLs so each deploy skips stale CDN and browser caches.
v="${RENDER_GIT_COMMIT:-$(date +%s)}"
v="${v:0:8}"
sed -i -E "s/(config\.js|social\.js|app\.js|styles\.css)\"/\1?v=${v}\"/g" index.html
echo "assets versioned: ${v}"
