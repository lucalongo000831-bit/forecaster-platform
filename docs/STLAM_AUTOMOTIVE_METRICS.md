# STLAM automotive metrics

## Definitions

| Metric | Definition used by KAIRO | Source |
| --- | --- | --- |
| Adjusted operating income | issuer-defined adjusted operating result | official annual filing |
| Industrial free cash flow | issuer-defined industrial-activities FCF | official annual filing |
| Industrial net financial position | issuer-defined industrial cash/debt position | official annual filing |
| Consolidated free cash flow | operating cash flow plus provider-signed capex | IFRS normalized cash flow |
| Consolidated net debt | total debt less cash | IFRS normalized balance sheet |
| Consolidated shipments | issuer-reported consolidated shipments | official annual filing |
| Inventory days | inventory / absolute cost of revenue × 365 | calculated |
| Capex/revenue | absolute capex / revenue | calculated |
| Asset turnover | revenue / total assets | calculated |

Industrial and consolidated measures are separate fields throughout types, engines, UI and tests. Financial-services debt is therefore not silently treated as industrial debt.

## Segment extraction

The adapter parses reportable rows using a six-value structure: current/prior revenue, current/prior adjusted operating income and current/prior shipments. Total, elimination, unallocated and reconciliation rows are excluded. Segment margins, revenue mix and year-over-year changes are calculated only after structural validation.

## Moat evidence

The filing parser also extracts the automotive brand portfolio and verifies statements about centralized design/engineering/development/manufacturing and retail/dealer finance. These facts support bounded assessments for brand, purchasing scale, distribution, dealer network and platform sharing. Missing unit economics, dealer counts and exclusivity prevent stronger classifications.

Observed scale is not automatically called a moat. In the verified downcycle, negative IFRS operating margin and negative ROIC produce `NONE` for cost advantage/economies-of-scale outcome evidence despite high shipment volume. Geographic diversification is based on structured segment revenue concentration.

## Cyclicality

Cyclicality combines revenue-growth dispersion, operating-margin dispersion and inventory change. The score is descriptive and evidence-based; it does not claim causality. Pricing/mix, incentives, dealer inventory, powertrain share, battery economics and supplier terms stay missing unless a structured official series is available.
