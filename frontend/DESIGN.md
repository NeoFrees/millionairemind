# MillionaireMind — Design System v2 ("Institutional")

The v1 interface was a dark, glowing terminal mock. v2 is a light, buy-side
console: the goal is a screen someone can read for eight hours and defend in a
risk meeting. Nothing here changes engine behaviour — this is presentation,
typography, and information hierarchy only.

## 1. Type

| Role | Family | Notes |
|---|---|---|
| UI text | Inter → SF Pro Display → Roboto | variable weight, `cv05`/`ss03` enabled |
| All numerals | JetBrains Mono → DIN Alternate | `tabular-nums`, applied via `.num` |

Every figure in the app carries `.num`, so decimal points stack into a column
across rows and cards. This is the single change that most separates a mockup
from an instrument.

Hierarchy:

- **H1** names the desk function, not the widget: *Capital Allocation & Execution*, *Risk Exposure & Limit Utilisation*, *Liquidity Pools & Settlement*.
- **H2** names the section: *Portfolio Performance*, *Risk Exposure by Asset Class*.
- **Micro-copy** (`.micro`, `#6B7280`) carries the qualifier every number needs: *"as of T+1 close"*, *"adjusted for fees and slippage"*, *"gross of tax"*.

## 2. Colour

| Token | Hex | Use |
|---|---|---|
| `void` | `#F8FAFC` | app canvas |
| `panel` | `#FFFFFF` | card surface |
| `panel2` | `#F9FAFB` | zebra stripe / row hover |
| `hair` / `hair2` | `#E2E8F0` / `#CBD5E1` | hairlines, dividers |
| `ink` | `#0F172A` | headers, key numbers |
| `body` / `muted` / `faint` | `#1E293B` / `#64748B` / `#6B7280` | primary / secondary / micro |
| `up` | `#10B981` | profit — emerald, never neon |
| `down` | `#EF4444` | loss — coral, never neon |
| `cyan` | `#2563EB` | primary action |
| `amber` | `#F59E0B` | **reserved** for paper mode / high volatility |

Amber is never an allocation or series colour. If something is amber, it is a
warning about the nature of the data, not a category.

Direction is carried by **shape as well as colour** — `▲ +4.8%` / `▼ -1.2%` —
so P&L survives greyscale printing and colour-blind readers.

## 3. Layout

A 12-column grid (`.grid12`) on a 24px gutter, with a 16px inner step for dense
panels. The standard split is `.col-main` (8/12 ≈ 70%) and `.col-rail`
(4/12 ≈ 30%).

**The tape** (top bar) is fixed: identity + paper badge on the left, the five
numbers that decide whether anything else matters in the centre (Total Equity,
Daily P&L, Cash & Equivalents, Buying Power, Next Rung), session controls on the
right — global search, ARMED/HALTED state, Pause Flow, Export Report,
notifications, socket state, account.

## 4. Components

- **Card** — white surface, 8px radius, one elevation (`0 4px 6px -1px rgba(0,0,0,.10)`), lifting on hover. There is exactly one card shadow in the system.
- **Table** — zebra striping, sticky header, row hover at `#F9FAFB`, sortable headers, right-aligned monospaced numerics. Open Positions runs *Instrument · Venue · Side · Quantity · Avg Cost · Mark · Notional · P&L · Chg · Kill Prox. · Action*.
- **Buttons** — primary solid `#2563EB`; secondary outlined blue; danger coral. All routing actions are disabled in paper mode and say so.
- **Gauge** — 270° radial dial for headroom-style metrics, colour keyed to proximity to the limit (green > 5%, amber 3–5%, red < 3%).
- **Allocation** — 100% stacked bar plus legend, or a treemap where area is the point.
- **Tooltip** — CSS-only, works inside table cells and chart cells. Every non-obvious number explains itself on hover.

## 5. Naming — concrete over conceptual

| v1 | v2 |
|---|---|
| Node 9/10 | Execution Engine Status (live order/risk log) |
| Scout, Guardian, … | Risk Management Suite (VaR, Sharpe, headroom, kill switch) |
| Distance to double | Projected Growth (required return to the next rung) |
| Protected reserve | Cash & Equivalents (cash / money market / T-bills) |
| Visuals · Live paper flow | Real-Time Order Book + P&L Attribution |
| General dashboard | Capital Allocation & Execution |

## 6. Honesty constraints

The redesign deliberately does **not** dress simulated output as a track record:

- Every screen carries the T0 simulation disclosure, and the tape carries a permanent amber `PAPER MODE` badge.
- VaR is labelled as a parametric shorthand (1.645σ on a 1.6% daily vol assumption), not a model output.
- Sharpe is labelled *session* Sharpe and computed from the actual equity series.
- Beta reads `n/a` because no benchmark series is wired, rather than inventing one.
- Projected Growth states a required return and explicitly declines to imply a timeline.
- The cash sleeve split is marked illustrative, because paper mode holds one balance.
