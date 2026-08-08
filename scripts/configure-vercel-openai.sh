#!/bin/bash
set -euo pipefail
set +x
umask 077
HISTFILE=/dev/null
set +o history 2>/dev/null || true

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
pnpm_binary="/Users/emanueledevitis/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm"
node_binary_dir="/Users/emanueledevitis/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"

cd "$repository_root"
export PATH="$node_binary_dir:/usr/bin:/bin"

printf '%s\n' 'Vercel Preview: inserisci nuovamente OPENAI_API_KEY quando richiesto.'
"$pnpm_binary" dlx vercel@latest env add OPENAI_API_KEY preview --sensitive
printf '%s\n' 'Vercel Production: inserisci nuovamente OPENAI_API_KEY quando richiesto.'
"$pnpm_binary" dlx vercel@latest env add OPENAI_API_KEY production --sensitive
printf '%s\n' 'OPENAI_API_KEY: CONFIGURATA SU VERCEL PREVIEW E PRODUCTION'
printf '%s\n' 'Development usa .env.local (chmod 600): Vercel non supporta Sensitive in Development.'
