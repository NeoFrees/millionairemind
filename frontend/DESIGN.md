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

## 7. v2.1 — instrument framing pass

A second pass pushed the "instrument, not dashboard" read further, following
patterns from how real trading terminals frame density (Bloomberg's own UX
writeup on progressive density and flat panels; Recharts' documented
range-value bar technique for candlesticks; shadcn's grid-pattern background
recipe):

- **Hairline engineering grid** — a 32px, 3%-opacity grid layered under the
  existing corner gradients (`body` in `index.css`). Reads as an instrument
  surface rather than a marketing page, and stays invisible enough that it
  never competes with card content.
- **Corner-bracket framing** (`.frame-corners` / `<FrameCorners>`) — four 1px
  L-ticks outside a panel's edge, in `cyan` at 55% opacity. Reserved for the
  one or two headline panels per screen (Equity Curve, Risk Management Suite,
  Allocation Treemap) — used on every card it stops being a signal.
- **Numbered section eyebrows** (`<Eyebrow index="01">`) — a small navy index
  chip plus a letter-spaced label above each major section, in place of a
  plain `<h2>`. Mirrors Bloomberg's dense labelling convention.
- **Real candlesticks** — `Equity Curve` now has an Area/Candles toggle. The
  candle view is built the way Recharts documents it: two `Bar`s whose
  `dataKey` resolves to a `[low, high]` / `[min(open,close), max(open,close)]`
  tuple (range-value bars), not a custom shape reaching into chart-internal
  axis state. See `toCandle()` and `<Candle>` in `components/ui.tsx`.
- **Inline sparklines** (`<Sparkline>`) — Total Equity and Daily P&L KPI
  tiles carry a trailing trend line (Recharts `AreaChart`, no axes, ~88×28px),
  the standard institutional-tile convention for "the number plus its recent
  shape" in one glance.
- **Correlation Exposure Matrix** — a heatmap grid on Portfolio Analytics
  showing which open positions share a correlation group. Deliberately *not*
  a fabricated correlation coefficient: cells mark a same-group flag pulled
  from the actual `correlation_group` field, with a tooltip and legend saying
  exactly that, so the instrument stays honest about what it's showing.


## 8. v2.1.1 - framing fix and local dev environment

- **FrameCorners height bug** - the v2.1 pass made `FrameCorners` stretch to
  `h-full` by default so it could pass through the Ladder screen's internal
  scroll region. That default was wrong: on Risk Exposure, the kill-switch
  section's flex-column ancestor has a *definite* height (set by CSS Grid's
  `align-items: stretch` against the taller sibling column), so `h-full`
  resolved against that definite height instead of behaving as a no-op. The
  wrapped section then consumed the whole column via `grid-rows-[minmax(0,1fr)]`,
  and `flex-shrink` on the sibling panels (combined with `overflow-hidden`
  removing their min-content floor) squeezed the Drawdown Circuit Breakers and
  Exposure Utilization panels down to zero height.
  Fix: `FrameCorners` now defaults to a plain wrapper (corner ticks only, no
  sizing participation) and takes an explicit `fill` prop for the one call
  site that needs height passthrough (`Ladder.tsx`). Verified via full-page
  screenshots on all six screens after the change.
- Extended the corner-frame treatment to the Risk kill switch, Treasury's
  Approval Inbox, and the Opportunities kanban board, so the framing motif
  reads consistently across every screen rather than just Dashboard and
  Portfolio Analytics.
- Removed the `playwright` devDependency (it was only ever needed for
  sandbox-side screenshot testing during this redesign) so a fresh
  `npm install` on this repo stays lean.

### Running it locally

Backend: `backend/.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
Frontend: `npm run dev -- --port 5180` from `frontend/` (or just `npm run dev`
for the default port 5173, if nothing else on the machine is using it).

`app/main.py`'s CORS `allow_origins` list includes both `:5173` and `:5180`
so the dev server works on either port - useful when another local project is
already bound to Vite's default port.
