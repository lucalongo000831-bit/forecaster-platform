# Seasonality engine

The active implementation is **Seasonality Engine V2**, model `seasonality-v2.0.0`.

The complete data flow, formulas, quality rules, API contract and limitations are documented in [SEASONALITY_V2_ENGINE.md](./SEASONALITY_V2_ENGINE.md).

V1 aggregate fields remain in the response for compatibility with Company Intelligence, Forecast, Signals and existing server-side consumers. They are calculated by the same V2 engine from the same validated history; there is no parallel seasonality implementation.
