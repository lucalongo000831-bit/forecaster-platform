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

fmp_api_key=""
alpha_vantage_api_key=""
massive_api_key=""

cleanup() {
  fmp_api_key=""
  alpha_vantage_api_key=""
  massive_api_key=""
  secret_value=""
  REPLY=""

  if [ -n "$temporary_file" ] && [ -f "$temporary_file" ]; then
    /bin/rm -f -- "$temporary_file"
  fi
}

trap cleanup EXIT HUP INT TERM

read_secret() {
  variable_name="$1"
  secret_value=""

  while [ -z "$secret_value" ]; do
    printf '%s: inserisci il valore (input nascosto): ' "$variable_name" >&2
    IFS= read -r -s secret_value
    printf '\n' >&2
  done

  REPLY="$secret_value"
  secret_value=""
}

read_secret "FMP_API_KEY"
fmp_api_key="$REPLY"
REPLY=""

read_secret "ALPHA_VANTAGE_API_KEY"
alpha_vantage_api_key="$REPLY"
REPLY=""

read_secret "MASSIVE_API_KEY"
massive_api_key="$REPLY"
REPLY=""

temporary_file="$(/usr/bin/mktemp "$repository_root/.env.local.tmp.XXXXXX")"
/bin/chmod 600 "$temporary_file"

if [ -f "$environment_file" ]; then
  /usr/bin/grep -v -E '^(FMP_API_KEY|ALPHA_VANTAGE_API_KEY|MASSIVE_API_KEY)=' "$environment_file" > "$temporary_file" || true
fi

printf 'FMP_API_KEY=%s\n' "$fmp_api_key" >> "$temporary_file"
printf 'ALPHA_VANTAGE_API_KEY=%s\n' "$alpha_vantage_api_key" >> "$temporary_file"
printf 'MASSIVE_API_KEY=%s\n' "$massive_api_key" >> "$temporary_file"

/bin/chmod 600 "$temporary_file"
/bin/mv -f -- "$temporary_file" "$environment_file"
temporary_file=""
/bin/chmod 600 "$environment_file"

fmp_api_key=""
alpha_vantage_api_key=""
massive_api_key=""

printf '%s\n' 'FMP_API_KEY: configurata'
printf '%s\n' 'ALPHA_VANTAGE_API_KEY: configurata'
printf '%s\n' 'MASSIVE_API_KEY: configurata'
