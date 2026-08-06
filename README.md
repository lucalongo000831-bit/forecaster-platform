# Kairo Market Intelligence

Kairo is a polished, responsive market-intelligence frontend built as an independent static product concept. It combines price action, seasonality, pattern analysis, momentum, company fundamentals, political trading activity, news, watchlists, portfolio allocation, and an event calendar in one coherent workspace.

All financial information is realistic mock data. The application does not call Yahoo Finance or any other external market-data API and does not require a backend.

## Highlights

- Original Kairo visual identity with responsive desktop, tablet, and mobile layouts
- Next.js App Router architecture with TypeScript
- Interactive navigation, global search, quick-tools launcher, filters, tabs, modals, and watchlist controls
- Recharts visualizations for price history, drawdown, annual performance, seasonality, patterns, momentum, fundamentals, revenue mix, political activity, and portfolio allocation
- Centralized, typed mock financial dataset
- Provider-based data boundary prepared for a future Yahoo Finance integration
- No iframe, copied production bundle, backend dependency, credential, or live API request

## Technology

- [Next.js](https://nextjs.org/) 16 with App Router
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) 4
- [Recharts](https://recharts.org/)
- [Lucide React](https://lucide.dev/)

## Getting started

Requirements:

- Node.js 20 or newer
- pnpm 10 or newer

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

To run the optimized production build locally:

```bash
pnpm build
pnpm start
```

No environment variables are required for the current mock implementation.

## Available scripts

```bash
pnpm dev        # Start the local development server
pnpm lint       # Run ESLint
pnpm typecheck  # Run the TypeScript compiler without emitting files
pnpm build      # Create the production build
pnpm start      # Serve the production build
```

## Main routes

| Route | Purpose |
| --- | --- |
| `/dashboard` | Personal control room and daily market overview |
| `/search` | Searchable multi-asset instrument universe |
| `/calendar` | Signal and market-event calendar |
| `/watchlists` | Interactive watchlist management |
| `/portfolio` | Portfolio metrics, allocation, and positions |
| `/settings` | Local profile and notification preferences |
| `/instrument/nasdaq/hlio/overview` | Instrument overview, returns, drawdown, dividends, and insiders |
| `/instrument/nasdaq/hlio/seasonality` | Multi-year seasonality analysis |
| `/instrument/nasdaq/hlio/pattern` | Pattern projection and historical cases |
| `/instrument/nasdaq/hlio/overbought-oversold` | Momentum, DPO, and oscillator analysis |
| `/instrument/nasdaq/hlio/fundamentals/analysis` | Fundamental summary and valuation analysis |
| `/instrument/nasdaq/hlio/fundamentals/statements` | Financial statements |
| `/instrument/nasdaq/hlio/fundamentals/ratios` | Valuation and profitability ratios |
| `/instrument/nasdaq/hlio/fundamentals/transcripts` | Mock earnings-call transcripts |
| `/instrument/nasdaq/hlio/political` | Political transaction activity |
| `/instrument/nasdaq/hlio/news` | Curated market-news briefing |

## Data architecture

The presentation layer is intentionally independent from the data source:

```text
src/
├── app/                    Route composition and server-side data loading
├── components/
│   ├── charts/             Pure chart components receiving data through props
│   └── financial/          Financial views and tables receiving typed props
├── data/mock/              Centralized mock dataset
├── lib/                    Formatters and route utilities
├── services/               Provider contract, implementation, and selector
└── types/                  Shared financial domain types
```

[`FinancialDataProvider`](src/services/financial-data-provider.ts) is the stable boundary used by the pages. The active implementation is [`MockFinancialDataProvider`](src/services/mock-financial-data-provider.ts), selected in [`financial-data-service.ts`](src/services/financial-data-service.ts).

To add Yahoo Finance later:

1. Create `YahooFinanceProvider` implementing `FinancialDataProvider`.
2. Normalize Yahoo responses into the existing domain types in `src/types`.
3. Replace the provider instance in `src/services/financial-data-service.ts`.

Charts, financial components, tables, and layouts will not need to change.

## Quality checks

Before opening a pull request, run:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

The current implementation passes all three checks.

## Security and data policy

- `.env`, `.env.local`, credentials, certificates, private keys, build output, and dependency folders are excluded from Git.
- The repository contains no passwords, API tokens, or service credentials.
- The current provider performs no network requests.
- If a future provider requires secrets, store them only in ignored environment files and document placeholders in `.env.example` without real values.

## Disclaimer

Kairo and Helio Systems are replaceable fictional identities. All prices, transactions, company information, articles, political activity, signals, and analytics are mock data for interface demonstration only and are not financial advice.
