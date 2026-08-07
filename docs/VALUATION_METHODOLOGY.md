# Valuation methodology

## Multiple valuation

Supported metrics include trailing/forward P/E, EV/EBITDA, EV/EBIT, EV/revenue, P/S, P/B, P/FCF, FCF yield, earnings yield, dividend yield and PEG. A multiple is reported only when numerator and denominator are economically meaningful. Negative earnings or FCF do not produce a conventional P/E or P/FCF.

Historical and peer comparisons are used only when the provider supplies enough comparable observations. A low multiple is not interpreted as cheap without quality, cyclicality, leverage and growth context.

## Traditional DCF

Unlevered or levered FCF is projected consistently from the available input. The base implementation uses an explicit forecast followed by a Gordon-growth terminal value:

`TV = FCF_n × (1 + g) / (WACC - g)`

`EV = Σ FCF_t / (1 + WACC)^t + TV / (1 + WACC)^n`

`Equity value = EV - net debt`

`Fair value/share = equity value / diluted shares`

The engine refuses non-equities, non-positive FCF, missing diluted shares, `WACC <= terminal growth`, implausible tax/margin inputs and unbounded growth. Bear/base/bull assumptions remain visible. Sensitivities cover WACC, terminal growth, operating margin and revenue growth.

## Reverse DCF

The reverse DCF solves for the constant explicit-period FCF growth rate that reconciles current enterprise value with discounted cash flows. A bounded bisection search is used; failure to bracket a solution is returned as unavailable rather than extrapolated.

Expectations are classified from the solved growth relative to observed FCF/revenue growth, margins and scenario limits. This output describes what the price appears to require; it is not a forecast.

## Margin of safety

`marginOfSafety = (prudentFairValue - currentPrice) / prudentFairValue`

The prudent composite uses available DCF, normalized multiple, analyst and technical values with quality/confidence adjustments. Missing methods are removed and remaining weights renormalized. Operational prices are rounded to ranges to avoid false precision.

## Foreign exchange

Valuation remains in the issuer's quote currency. A secondary EUR value is displayed only when a verified FX quote with provider and timestamp is available.
