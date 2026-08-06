# Data limitations

- Yahoo Finance access is unofficial through `yahoo-finance2`; availability, fields and latency can change without notice.
- Realtime status depends on exchange entitlements. The UI must disclose delayed, cached and market-closed data.
- FMP, Alpha Vantage and Massive endpoints depend on the user’s subscription plan. Authorization does not imply entitlement to every dataset.
- International ticker mapping is provider-specific; identical display symbols can represent different instruments.
- Adjusted history may differ across vendors due to corporate-action methodology and corrections.
- Fundamentals are point-in-time only when publication timestamps exist; otherwise they are excluded from historical backtests.
- Analyst targets are opinions with varying coverage and dates, not model truth.
- News metadata can be incomplete; article bodies may not be licensed for storage or redistribution.
- Political transactions require a specialist disclosure source and remain unavailable until one is authorized.
- Qualitative geopolitical exposure cannot be expressed as invented revenue percentages.
- Seasonality and forecasts describe distributions; small samples, regime changes and outliers reduce reliability.
- Portfolio performance across currencies requires FX observations; unavailable rates produce partial results.
- Demo fallback is fictional, visibly labelled and excluded from persistent calculations, signals, forecasts and backtests.

Provider terms must be reviewed before long-term storage, redistribution or commercial use.
