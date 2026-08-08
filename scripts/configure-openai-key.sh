#!/bin/bash

set -euo pipefail
set +x

umask 077
HISTFILE=/dev/null
set +o history 2>/dev/null || true

script_dir="$(cd "$(dirname "$0")" && pwd)"
repository_root="$(cd "$script_dir/.." && pwd)"
environment_file="$repository_root/.env.local"
temporary_file=""
openai_api_key=""

cleanup() {
  openai_api_key=""

  if [ -n "$temporary_file" ] && [ -f "$temporary_file" ]; then
    /bin/rm -f -- "$temporary_file"
  fi
}

trap cleanup EXIT HUP INT TERM

while [ -z "$openai_api_key" ]; do
  printf '%s' 'OPENAI_API_KEY: inserisci il valore (input nascosto): ' >&2
  IFS= read -r -s openai_api_key
  printf '\n' >&2
done

temporary_file="$(/usr/bin/mktemp "$repository_root/.env.local.tmp.XXXXXX")"
/bin/chmod 600 "$temporary_file"

if [ -f "$environment_file" ]; then
  /usr/bin/grep -v -E '^OPENAI_API_KEY=' "$environment_file" > "$temporary_file" || true
fi

printf 'OPENAI_API_KEY=%s\n' "$openai_api_key" >> "$temporary_file"
openai_api_key=""

/bin/chmod 600 "$temporary_file"
/bin/mv -f -- "$temporary_file" "$environment_file"
temporary_file=""
/bin/chmod 600 "$environment_file"

printf '%s\n' 'OPENAI_API_KEY: CONFIGURATA'
