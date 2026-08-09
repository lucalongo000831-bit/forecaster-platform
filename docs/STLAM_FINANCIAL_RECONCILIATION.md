# STLAM financial reconciliation

## Comparable history

The comparable issuer history begins in 2021 after the Stellantis combination. The pipeline uses annual periods 2021–2025 and does not splice pre-combination FCA/PSA financials into a false continuous issuer history.

SEC Company Facts are read across `ifrs-full`, `dei`, `us-gaap` and issuer-extension namespaces. Annual duration contexts anchor each fiscal year; interim contexts are not promoted to full-year statements. Monetary values retain filing currency and facts keep concept, accession, timestamp, unit and source URL lineage.

## Statement formulas

- gross profit = revenue − cost of revenue when not directly tagged;
- EBITDA = operating income + depreciation/amortization when both inputs exist;
- total debt = short-term debt + long-term debt when the aggregate is absent;
- total liabilities = total assets − equity when the aggregate is absent;
- free cash flow = operating cash flow − absolute capex;
- working capital = current assets − current liabilities;
- net debt = total debt − cash.

## Shares and market capitalization

Period-end common shares are preferred for market-cap reconciliation; diluted weighted-average shares are used for per-share earnings and valuation when appropriate. Market cap is the requested Milan price in EUR multiplied once by issuer shares. The NYSE and Paris listings are identifiers of the same issuer, not extra share counts.

## Valuation normalization

The current period has negative earnings, EBITDA and free cash flow. Consequently trailing P/E, EV/EBITDA, P/FCF and PEG are `NOT_APPLICABLE`, not fabricated. Forward P/E is a provider analyst metric. The DCF uses median comparable revenue, operating margin, net income and free cash flow over five issuer periods; bear/base/bull growth is bounded by historical distribution and mature-automotive limits.

The reverse DCF solves the five-year FCF growth implied by the observed equity price plus net debt, with 10% discount rate and 2% terminal growth. Sensitivity spans discount and terminal-growth assumptions. Results are model outputs, not price promises or personalized advice.

## Automotive reconciliation

Official adjusted operating income, Industrial FCF and industrial net financial position are stored alongside—never in place of—IFRS operating income, consolidated FCF and consolidated net debt. The UI labels each scope explicitly.
