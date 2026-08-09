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

eodhd_api_token=""
finnhub_api_key=""
coingecko_api_key=""
coingecko_api_mode=""
sec_user_agent=""
secret_value=""
REPLY=""

cleanup() {
  eodhd_api_token=""
  finnhub_api_key=""
  coingecko_api_key=""
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
  printf '"%s"' "$value"
}

read_secret "EODHD_API_TOKEN"
eodhd_api_token="$REPLY"
REPLY=""

read_secret "FINNHUB_API_KEY"
finnhub_api_key="$REPLY"
REPLY=""

read_secret "COINGECKO_API_KEY"
coingecko_api_key="$REPLY"
REPLY=""

while :; do
  printf '%s' 'COINGECKO_API_MODE [demo/pro] (default: pro): ' >&2
  IFS= read -r coingecko_api_mode
  coingecko_api_mode="${coingecko_api_mode:-pro}"
  case "$coingecko_api_mode" in
    demo|pro) break ;;
    *) printf '%s\n' 'Valore non valido. Inserisci demo oppure pro.' >&2 ;;
  esac
done

while [ -z "$sec_user_agent" ]; do
  printf '%s\n' 'Inserisci SEC User-Agent (esempio: KAIRO Market Intelligence contact@example.com)' >&2
  IFS= read -r sec_user_agent
done

temporary_file="$(/usr/bin/mktemp "$expected_root/.env.local.tmp.XXXXXX")"
/bin/chmod 600 "$temporary_file"

if [ -f "$environment_file" ]; then
  /usr/bin/awk '!/^(EODHD_API_TOKEN|FINNHUB_API_KEY|COINGECKO_API_KEY|COINGECKO_API_MODE|SEC_USER_AGENT|ENABLE_ESEF_INGESTION|ENABLE_KAIRO_AI)=/' "$environment_file" > "$temporary_file"
fi

printf 'EODHD_API_TOKEN=%s\n' "$(quote_env_value "$eodhd_api_token")" >> "$temporary_file"
printf 'FINNHUB_API_KEY=%s\n' "$(quote_env_value "$finnhub_api_key")" >> "$temporary_file"
printf 'COINGECKO_API_KEY=%s\n' "$(quote_env_value "$coingecko_api_key")" >> "$temporary_file"
printf 'COINGECKO_API_MODE=%s\n' "$coingecko_api_mode" >> "$temporary_file"
printf 'SEC_USER_AGENT=%s\n' "$(quote_env_value "$sec_user_agent")" >> "$temporary_file"
printf '%s\n' 'ENABLE_ESEF_INGESTION=true' >> "$temporary_file"
printf '%s\n' 'ENABLE_KAIRO_AI=false' >> "$temporary_file"

/bin/chmod 600 "$temporary_file"
/bin/mv -f -- "$temporary_file" "$environment_file"
temporary_file=""
/bin/chmod 600 "$environment_file"

eodhd_api_token=""
finnhub_api_key=""
coingecko_api_key=""
REPLY=""

printf '%s\n' 'EODHD_API_TOKEN: SAVED'
printf '%s\n' 'FINNHUB_API_KEY: SAVED'
printf '%s\n' 'COINGECKO_API_KEY: SAVED'
printf '%s\n' '.env.local permissions: 600'
