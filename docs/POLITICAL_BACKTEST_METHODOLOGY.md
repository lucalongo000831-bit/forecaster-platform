# Political backtest methodology

## Point-in-time rule

The only permitted market-availability timestamp is `marketAvailableDate = disclosureDate`. If a transaction occurred on 1 January and was disclosed on 20 January, no screen, signal, cluster, ranking, alert or historical sample may use it before 20 January. Entry is the first valid market close on or after that date.

## Horizons and benchmark

The deterministic engine calculates raw and SPY-relative close-to-close returns at 1, 5, 20, 60 and 120 observations. It also records maximum favourable and adverse excursion over the following 120 observations. Missing history produces `null` and `INSUFFICIENT_HISTORY`.

Historical studies keep purchases and sales separate and publish sample size, mean, median, positive relative-return hit rate, standard deviation and confidence. Confidence is based only on sample count: very low below 3, low from 3, medium from 8, high from 15 and very high from 30 observations.

These are descriptive event studies. They do not adjust for execution costs, liquidity, tax, options non-linearity, undisclosed holdings, sizing inside statutory ranges or member-specific risk. They are not evidence of causality or a promise of performance.
