# Global Markets data sources

| Block | Primary inputs | Treatment |
| --- | --- | --- |
| Market prices | Existing Massive → Yahoo → FMP router order | Direct quote/bar where supported |
| Volatility | VIX plus realized volatility and normalized ATR from SPY, QQQ, VGK and BTC-USD | Mixed direct/calculated |
| Credit | HYG, LQD and XLF performance | Explicit proxy; not a direct spread |
| Liquidity | SPY relative volume and spread, UUP, TLT and XLF | Direct where quoted; otherwise explicit proxy |
| Rates | US 2Y/10Y market symbols plus macro policy-rate/inflation observations | Direct or unavailable |
| Breadth | Sector ETF participation, RSP/SPY and IWM/SPY | Explicit proxy |
| Equity | SPY, QQQ, DIA, IWM, VGK and EWI | ETF/index proxies with calculated statistics |
| Cross-asset | TLT, UUP, GLD, USO, BTC-USD, ETH-USD and equity proxies | Calculated returns, volatility and correlations |
| Macro | FMP and Alpha Vantage macro adapters; FMP calendar | Direct observations, no recession prediction |
| News risk | Alpha Vantage NEWS_SENTIMENT through the news router | Deterministic sentiment concentration rules |

EWI is labelled as an Italy / FTSE MIB proxy; TLT, UUP and ETF breadth instruments are never described as direct underlying market measures. Source timestamps and freshness are shown by category. No provider credentials or upstream endpoint details are returned to the browser.
