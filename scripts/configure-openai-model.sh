#!/bin/bash
set -euo pipefail
set +x
umask 077

script_dir="$(cd "$(dirname "$0")" && pwd)"
repository_root="$(cd "$script_dir/.." && pwd)"
environment_file="$repository_root/.env.local"
model="${1:-}"

if [[ ! "$model" =~ ^[A-Za-z0-9._-]+$ ]]; then
  printf '%s\n' 'OPENAI_MODEL non valido' >&2
  exit 1
fi

temporary_file="$(/usr/bin/mktemp "$repository_root/.env.local.model.XXXXXX")"
trap '/bin/rm -f -- "$temporary_file"' EXIT HUP INT TERM
/bin/chmod 600 "$temporary_file"
if [ -f "$environment_file" ]; then
  /usr/bin/grep -v -E '^OPENAI_MODEL=' "$environment_file" > "$temporary_file" || true
fi
printf 'OPENAI_MODEL=%s\n' "$model" >> "$temporary_file"
/bin/mv -f -- "$temporary_file" "$environment_file"
/bin/chmod 600 "$environment_file"
trap - EXIT HUP INT TERM
printf '%s\n' 'OPENAI_MODEL: CONFIGURATO'
