const P = require('../extension/parser.js');
// time, cur, contract, type, dir, qty, pos, price, funding, fee, cashflow, change, balance  (порядок как на странице: сверху вниз)
const raw = `2026-10-02 20:21:25|USDT|PUMPFUNUSDT|Trade|Close Sell|41,600.0000|41,600.000|0.00619200|0.00000000|0.1417 USDT|+7.6128|+7.4711|49,929.6231
2026-10-02 20:00:00|USDT|HUMAUSDT|Funding Rate Settlement|Buy|--|7,270.000|--|-0.01227104|-- USDT|0.0000|-0.0123|49,922.1520
2026-10-02 20:00:00|USDT|PUMPFUNUSDT|Funding Rate Settlement|Buy|--|83,200.000|--|-0.02488096|-- USDT|0.0000|-0.0249|49,922.1642
2026-10-02 16:53:29|USDT|HUMAUSDT|Trade|Close Sell|7,269.0000|7,270.000|0.03268000|0.00000000|0.1307 USDT|-12.4300|-12.5606|49,922.1891
2026-10-02 16:00:00|USDT|PUMPFUNUSDT|Funding Rate Settlement|Buy|--|83,200.000|--|-0.02415546|-- USDT|0.0000|-0.0242|49,934.7498
2026-10-02 16:00:00|USDT|HUMAUSDT|Funding Rate Settlement|Buy|--|14,539.000|--|-0.02394574|-- USDT|0.0000|-0.0239|49,934.7739
2026-10-02 13:29:40|USDT|HUMAUSDT|Trade|Open Buy|14,539.0000|14,539.000|0.03439000|0.00000000|0.2750 USDT|0.0000|-0.2750|49,934.7979
2026-10-02 12:00:00|USDT|PUMPFUNUSDT|Funding Rate Settlement|Buy|--|83,200.000|--|-0.02478112|-- USDT|0.0000|-0.0248|49,935.0729
2026-10-02 11:52:39|USDT|PUMPFUNUSDT|Trade|Open Buy|83,200.0000|83,200.000|0.00600900|0.00000000|0.2750 USDT|0.0000|-0.2750|49,935.0976
2026-10-02 05:11:11|USDT|ZKCUSDT|Liquidation|Close Buy|0.1000|0.000|0.04559000|0.00000000|0.0000 USDT|-0.0004|-0.0004|49,935.3726
2026-10-02 04:06:22|USDT|ZKCUSDT|Trade|Close Buy|1,206.2000|-0.100|0.04242000|0.00000000|0.0281 USDT|-1.1700|-1.1982|49,935.3730
2026-10-02 04:06:22|USDT|ZKCUSDT|Trade|Close Buy|1,206.2000|-1,206.300|0.04242000|0.00000000|0.0281 USDT|-1.1700|-1.1982|49,936.5712
2026-10-02 04:00:00|USDT|ZKCUSDT|Funding Rate Settlement|Sell|--|-2,412.500|--|0.00506142|-- USDT|0.0000|+0.0051|49,937.7693
2026-10-02 00:00:00|USDT|ZKCUSDT|Funding Rate Settlement|Sell|--|-2,412.500|--|0.00502523|-- USDT|0.0000|+0.0050|49,937.7643
2026-10-01 20:00:00|USDT|ZKCUSDT|Funding Rate Settlement|Sell|--|-2,412.500|--|0.00500352|-- USDT|0.0000|+0.0050|49,937.7593
2026-10-01 19:20:14|USDT|ALICEUSDT|Trade|Close Sell|0.1000|0.000|0.22463000|0.00000000|0.0000 USDT|+0.0054|+0.0054|49,937.7542
2026-10-01 18:48:21|USDT|ALICEUSDT|Trade|Close Sell|293.4000|0.100|0.17859000|0.00000000|0.0288 USDT|+2.4117|+2.3829|49,937.7488
2026-10-01 18:48:06|USDT|ALICEUSDT|Trade|Close Sell|293.4000|293.500|0.17566000|0.00000000|0.0283 USDT|+1.5521|+1.5237|49,935.3659
2026-10-01 17:54:25|USDT|ZKCUSDT|Trade|Open Sell|2,412.5000|-2,412.500|0.04145000|0.00000000|0.0550 USDT|0.0000|-0.0550|49,933.8422
2026-10-01 14:23:17|USDT|ALICEUSDT|Trade|Open Buy|586.9000|586.900|0.17037000|0.00000000|0.0550 USDT|0.0000|-0.0550|49,933.8972`;
const F = ['time','currency','contract','type','direction','qty','position','price','funding','fee','cashFlow','change','balance'];
const rows = raw.split('\n').map((l, i) => { const c = l.split('|'); const o = {}; F.forEach((f, j) => o[f] = c[j]); const r = P.buildRow(o, l); r.seq = 10000 + i; return r; });
const A = P.analyze(rows);
const r4 = (x) => Math.round(x * 1e4) / 1e4;
console.log('totals', Object.fromEntries(Object.entries(A.totals).map(([k, v]) => [k, typeof v === 'number' ? r4(v) : v])));
console.log('rounds', { ...A.rounds, best: A.rounds.best?.contract, worst: A.rounds.worst?.contract });
for (const r of A.roundList) console.log(r.contract, r.side, r.closed ? 'closed' : 'OPEN', 'net', r4(r.net), 'gross', r4(r.gross), 'fees', r4(r.fees), 'fund', r4(r.funding), 'liq', r.liquidated, 'pct', r.pctOfNotional && r4(r.pctOfNotional));
const assert = require('assert');
assert.strictEqual(r4(A.totals.net), r4(rows.reduce((s, r) => s + r.change, 0)));
assert.strictEqual(r4(A.totals.startBalance), 49933.9522);
assert.strictEqual(A.totals.endBalance, 49929.6231);
console.log('OK');
