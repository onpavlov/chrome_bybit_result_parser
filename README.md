# Bybit PnL Summary (Chrome extension)

A Chrome extension that reads the Bybit **Transaction Log** page and shows what you actually earned or lost: total PnL, ROI, fees, funding, and a breakdown by contract, by trade and by day.

All processing happens in your browser. The extension does not call any APIs, does not send data anywhere and needs no API keys. It only reads the table already shown on the page.

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right corner).
4. Click **Load unpacked** and select the `extension/` folder.

## Usage

1. Log in to Bybit and open **Assets → Unified Trading Account → Transaction Log**.
2. Pick a date range and press **Search**, as you normally would.
3. Click the orange **📊 PnL** button in the bottom-right corner, or click the extension icon in the toolbar.
4. Press **⏩ Собрать все страницы** (*Collect all pages*) to page through the whole log automatically. You can also just click **Next** yourself, since every page you view is picked up.

> The panel interface is currently in Russian. The labels below are given with their English meaning.

### Panel buttons

| Button | What it does |
|---|---|
| ⏩ Собрать все страницы (Collect all pages) | Clicks **Next** until the last page and gathers every row |
| ↻ | Re-reads the current page |
| CSV | Downloads all collected rows as a CSV file |
| Сброс (Reset) | Forgets everything collected so far and starts over |

Collected rows are saved in the extension's local storage, so they survive page reloads. Rows are de-duplicated, which means you can go through several date ranges one after another and they add up. Press **Сброс** (*Reset*) when you want a clean calculation, for example after changing the contract filter.

## What it shows

### Итоги (Summary)
- **Net PnL**: the final result, including fees and funding.
- **ROI**: net PnL as a percentage of your wallet balance at the start of the period.
- **Profit / Loss**: the sum of contracts that ended in profit and the sum of contracts that ended in loss. Together they add up to net PnL.
- **Breakdown**: gross profit, gross loss, realized PnL, trading fees, funding received and funding paid, liquidations.
- **Balance**: start balance, end balance, balance change in %, maximum drawdown.
- **Cumulative PnL chart**.
- **Trade statistics**: win rate, profit factor, average win and average loss, expectancy per trade, best and worst trade, win and loss streaks, average holding time, Long vs Short results, trading volume, and fees as a share of gross profit.

### Контракты (Contracts)
Net result, realized PnL, fees, funding and wins/losses for each contract.

### Сделки (Trades)
Each position from opening until it returns to zero:
- side (Long or Short)
- net result with fees and funding included
- % return on position size
- average entry and exit price
- holding time

Positions that are still open are highlighted. Positions opened before the selected period are marked with `*`.

### По дням (By day)
Daily net result, PnL, fees, funding and number of fills.

## How numbers are calculated

The extension uses the log's own columns:

| Column | Meaning |
|---|---|
| Cash Flow | Realized PnL of a fill |
| Fee Paid | Trading fee |
| Funding | Funding payment (positive means received) |
| Change | Net effect on the wallet: `Cash Flow − Fee + Funding` |
| Wallet Balance | Balance after the row |

- **Net PnL** is the sum of **Change** over all rows except transfers.
- **Start balance** is the oldest row's wallet balance minus its change.
- Transfers, deposits and withdrawals are shown separately and are not counted as PnL.
- If the log contains several currencies (for example USDT and USDC), a selector lets you switch between them.

## Supported pages

- Works on `bybit.com` and on regional Bybit domains (`bybit.global`, `bybit.eu`, `bybit.nl`, `bybit.kz`, `bybit.tr` and others).
- Columns are detected by their header text, not by CSS classes, so both the English and the Russian interface are supported.
- Bybit only keeps the last 10,000 records for the past 6 months, and so does this extension.

## Project structure

```
extension/
  manifest.json   Chrome extension manifest (MV3)
  parser.js       Table parsing and all calculations
  content.js      Floating button, panel UI, auto-paging, storage
  background.js   Toggles the panel when the toolbar icon is clicked
test/
  analyze.test.js Calculation test on sample data
```

## Tests

```bash
node test/analyze.test.js
```

## Disclaimer

This is an unofficial tool and is not affiliated with Bybit. The figures are calculated from the data shown on the page and may differ slightly from Bybit's own reports. Do not rely on them for tax or accounting purposes.
