# TradingView Charting Library — integration plan (backtest chart V2)

Goal: give traders a chart with **their own tools that persist** (drawings,
indicators, layouts saved per-user) inside the backtest page — instead of the
current stateless free embed widget.

## What it gives vs. what it does NOT
**Gives**
- Self-hosted TradingView **Advanced Charts** (Charting Library) — free since 2024.
- Full drawing tools + the standard built-in technical indicators.
- **Per-user persistence**: each user's drawings / studies / chart layouts are
  saved to **our** backend (Firestore) and reloaded next time. This is the
  "my own tools" experience.
- Our own data feed (we already have Binance/Bybit klines via the Worker).

**Does NOT give** (hard TradingView limits — be honest with users)
- Logging into a user's personal **tradingview.com** account.
- Their existing tradingview.com saved layouts.
- **Pine Script** custom indicators (Pine is exclusive to tradingview.com).

## Prerequisite (owner action — blocks everything)
TradingView gates the library behind a free access request:
1. Go to https://www.tradingview.com/advanced-charts/ and request access
   (a.k.a. "Get the library" / Charting Library application form).
2. They grant access to the private GitHub repo `tradingview/charting_library`.
3. Accept their license. The library files are then ours to self-host.

Until this is done, the integration cannot start (the JS files are not public).

## Architecture (3 parts)
1. **Host the library**: drop `charting_library/` static files into `public/`
   (or a CDN). Load it on the backtest page only (lazy).
2. **Datafeed adapter** (`src/services/tvDatafeed.js`): implement the
   [Datafeed API](https://www.tradingview.com/charting-library-docs/) backed by
   our Worker:
   - `onReady`, `resolveSymbol`, `searchSymbols`
   - `getBars` → Worker klines endpoint (Binance/Bybit) mapped to OHLCV
   - `subscribeBars` → poll/websocket for live updates (optional V2.1)
3. **Save/Load adapter** (`save_load_adapter`): store chart layouts + drawing
   templates + study templates per user in Firestore
   (`users/{uid}/chartLayouts/...`). Wire `auto_save_delay` so it saves silently.

## Integration points
- Replace `TradingViewPanel` internals with the library widget (same full-width
  slide-up panel + toolbar-stays-above UX we already shipped).
- Keep symbol sync to the backtest form pair.
- Theme: pass `theme: 'dark' | 'light'` from the app theme.

## Effort estimate
- Datafeed adapter: ~1 day (we have the data; mostly mapping + caching).
- Save/Load to Firestore + per-user layouts UI: ~1 day.
- Library hosting + widget wiring + theme + symbol sync: ~0.5 day.
- QA day/night + mobile: ~0.5 day.
Total: ~3 days once access is granted.

## Firestore rules
Add owner-only read/write for `users/{uid}/chartLayouts/{id}` (and study/drawing
templates). Deploy rules manually (CI lacks the perm).

## Rollout
feature/tv-charting-library → dev (staging validation) → main. Keep the current
free widget as the fallback if the library fails to load.
