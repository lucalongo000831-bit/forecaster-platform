# Target and risk engines

## Target model

`target-composite-v1.0.0` keeps analyst, technical, fundamental and macro-regime
targets separate. Its 3M, 6M, 12M and long-term weights are applied only to
available sources and then renormalized. Missing data never becomes a mock
target. Bear, base and bull outputs are scenario estimates, not price promises.

The analyst block exposes low, mean, median, high, analyst count, dispersion,
date, provider and upside/downside. The technical block uses support,
resistance, recent swing points and ATR. Fibonacci and volume profile are not
shown because the current data contracts do not provide enough evidence for a
robust calculation. Peer-group valuation is also unavailable.

## DCF

`dcf-v1.0.0` uses positive free cash flow, net debt and shares outstanding with
a five-year explicit period, bounded growth assumptions, terminal growth below
the discount rate and a 10% margin of safety. It returns bear/base/bull scenarios
and a 3×3 discount-rate/terminal-growth sensitivity grid. DCF is disabled for
ETFs, indices, crypto, currencies, negative free cash flow and insufficient
inputs. Warnings remain visible rather than being replaced with estimates.

## Risk planner

`risk-plan-v1.0.0` supports LONG and SHORT sides plus conservative, moderate,
aggressive and bounded custom profiles. It calculates structural, ATR and
percentage stops, an informational median suggested stop, 1R/2R/3R targets,
trailing distance, optional chandelier exit and optional position size. Position
size requires both account size and maximum risk percent and is capped by the
cash value of the position.

The planner never submits an order. Gap risk, slippage, liquidity and personal
constraints are not modeled and must be evaluated separately.
