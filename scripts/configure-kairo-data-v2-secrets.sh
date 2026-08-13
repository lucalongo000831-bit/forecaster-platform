#!/bin/bash

set -euo pipefail
set +x

umask 077
HISTFILE=/dev/null
set +o history 2>/dev/null || true

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
expected_root="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
repository_root="$(git -C "$expected_root" rev-parse --show-toplevel 2>/dev/null || true)"
environment_file="$expected_root/.env.local"
temporary_file=""
secret_value=""
REPLY=""

fred_api_key=""
bls_api_key=""
bea_api_key=""
eia_api_key=""
marketaux_api_token=""
openfigi_api_key=""

cleanup() {
  fred_api_key=""
  bls_api_key=""
  bea_api_key=""
  eia_api_key=""
  marketaux_api_token=""
  openfigi_api_key=""
  secret_value=""
  REPLY=""

  if [ -n "$temporary_file" ] && [ -f "$temporary_file" ]; then
    /bin/rm -f -- "$temporary_file"
  fi
}

trap cleanup EXIT HUP INT TERM

if [ -z "$repository_root" ] || [ "$repository_root" != "$expected_root" ] || [ ! -f "$repository_root/package.json" ]; then
  printf '%s\n' 'ERROR: esegui lo script dalla root del repository forecaster-platform.' >&2
  exit 1
fi

if [ -f "$environment_file" ] && /usr/bin/grep -Eq '^ENABLE_KAIRO_AI=(true|"true"|'"'"'true'"'"')$' "$environment_file"; then
  printf '%s\n' 'ERROR: ENABLE_KAIRO_AI deve restare false. Correggi la configurazione separatamente prima di continuare.' >&2
  exit 1
fi

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

quote_env_value() {
  value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\\$}"
  value="${value//$'\n'/}"
  value="${value//$'\r'/}"
  printf '"%s"' "$value"
}

read_secret "FRED_API_KEY"
fred_api_key="$REPLY"
REPLY=""

read_secret "BLS_API_KEY"
bls_api_key="$REPLY"
REPLY=""

read_secret "BEA_API_KEY"
bea_api_key="$REPLY"
REPLY=""

read_secret "EIA_API_KEY"
eia_api_key="$REPLY"
REPLY=""

read_secret "MARKETAUX_API_TOKEN"
marketaux_api_token="$REPLY"
REPLY=""

read_secret "OPENFIGI_API_KEY"
openfigi_api_key="$REPLY"
REPLY=""

temporary_file="$(/usr/bin/mktemp "$expected_root/.env.local.tmp.XXXXXX")"
/bin/chmod 600 "$temporary_file"

if [ -f "$environment_file" ]; then
  /usr/bin/awk '!/^(FRED_API_KEY|BLS_API_KEY|BEA_API_KEY|EIA_API_KEY|MARKETAUX_API_TOKEN|OPENFIGI_API_KEY)=/' "$environment_file" > "$temporary_file"
fi

printf 'FRED_API_KEY=%s\n' "$(quote_env_value "$fred_api_key")" >> "$temporary_file"
printf 'BLS_API_KEY=%s\n' "$(quote_env_value "$bls_api_key")" >> "$temporary_file"
printf 'BEA_API_KEY=%s\n' "$(quote_env_value "$bea_api_key")" >> "$temporary_file"
printf 'EIA_API_KEY=%s\n' "$(quote_env_value "$eia_api_key")" >> "$temporary_file"
printf 'MARKETAUX_API_TOKEN=%s\n' "$(quote_env_value "$marketaux_api_token")" >> "$temporary_file"
printf 'OPENFIGI_API_KEY=%s\n' "$(quote_env_value "$openfigi_api_key")" >> "$temporary_file"

/bin/chmod 600 "$temporary_file"
/bin/mv -f -- "$temporary_file" "$environment_file"
temporary_file=""
/bin/chmod 600 "$environment_file"

fred_api_key=""
bls_api_key=""
bea_api_key=""
eia_api_key=""
marketaux_api_token=""
openfigi_api_key=""
REPLY=""

printf '%s\n' 'FRED_API_KEY: SAVED'
printf '%s\n' 'BLS_API_KEY: SAVED'
printf '%s\n' 'BEA_API_KEY: SAVED'
printf '%s\n' 'EIA_API_KEY: SAVED'
printf '%s\n' 'MARKETAUX_API_TOKEN: SAVED'
printf '%s\n' 'OPENFIGI_API_KEY: SAVED'
printf '%s\n' '.env.local permissions: 600'
