# Financial provider credentials

The repository uses three independent, server-only credentials:

- `FMP_API_KEY` for Financial Modeling Prep REST requests.
- `ALPHA_VANTAGE_API_KEY` for Alpha Vantage REST requests.
- `MASSIVE_API_KEY` for Massive REST requests.

Massive Flat Files are not implemented. S3 access keys, S3 secret keys, the
`files.massive.com` endpoint, and the `flatfiles` bucket must not be configured
or used as the Massive REST credential.

## Local configuration

Run the interactive macOS-compatible configurator from the repository root:

```bash
./scripts/configure-secrets.sh
```

The script reads each value with hidden terminal input, replaces only the three
managed variables, preserves unrelated entries in `.env.local`, and sets file
permissions to `600`. Values are never accepted as command-line arguments.

## Server-only access

`src/services/financial-provider-env.ts` is protected by `server-only`. It
contains the environment-variable mapping, a credential getter that reports
only `Variabile mancante`, and a non-public boolean configuration check. Do not
import it from a Client Component or expose credentials through an API route.

## Connectivity test

After local configuration, run:

```bash
node scripts/test-financial-providers.mjs
```

The test performs one small request per provider and outputs only one of the
documented status labels. It never logs credentials, authorization headers, or
request URLs.

## Vercel

Create the same three encrypted environment variables separately for
Development, Preview, and Production. Keep the framework preset on Next.js and
do not configure an Output Directory override.
