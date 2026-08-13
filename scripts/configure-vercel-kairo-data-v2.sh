#!/bin/bash

set -euo pipefail
set +x

HISTFILE=/dev/null
set +o history 2>/dev/null || true

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
repository_root="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
pnpm_binary="/Users/emanueledevitis/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm"
node_binary_dir="/Users/emanueledevitis/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"

if [ ! -f "$repository_root/package.json" ] || [ ! -f "$repository_root/.vercel/project.json" ]; then
  printf '%s\n' 'ERROR: progetto Vercel esistente non collegato nella root attesa.' >&2
  exit 1
fi

if [ ! -x "$pnpm_binary" ]; then
  printf '%s\n' 'ERROR: runtime Vercel CLI non disponibile.' >&2
  exit 1
fi

cd "$repository_root"
export PATH="$node_binary_dir:/usr/bin:/bin"

variables='FRED_API_KEY BLS_API_KEY BEA_API_KEY EIA_API_KEY MARKETAUX_API_TOKEN OPENFIGI_API_KEY'

for variable_name in $variables; do
  printf '\n%s\n' "$variable_name — Preview e Production (input Vercel nascosto)"
  "$pnpm_binary" dlx vercel@latest env add "$variable_name" production,preview --sensitive

  printf '%s\n' "$variable_name — Development (input Vercel)"
  "$pnpm_binary" dlx vercel@latest env add "$variable_name" development --no-sensitive

  printf '%s\n' "$variable_name: SAVED ON VERCEL"
done

printf '\n%s\n' 'KAIRO DATA V2: VERCEL ENV CONFIGURATION COMPLETED'
