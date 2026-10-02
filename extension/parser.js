// Парсинг таблицы «Журнал транзакций» Bybit и расчёт статистики.
// Не завязан на CSS-классы: колонки определяются по тексту заголовков (RU/EN).
(function (root) {
  'use strict';

  const HEADERS = {
    time: ['время', 'time'],
    currency: ['валюта', 'currency', 'coin'],
    contract: ['контракт', 'contract', 'contracts', 'symbol'],
    type: ['тип', 'type'],
    direction: ['направление', 'direction', 'side'],
    qty: ['количество', 'quantity', 'qty'],
    position: ['позиция', 'position'],
    price: ['цена исполнения', 'filled price', 'exec price', 'execution price', 'price'],
    funding: ['финансирование', 'funding', 'funding fee'],
    fee: ['уплачено', 'fee paid', 'fees paid', 'trading fee', 'fee'],
    cashFlow: ['денежный поток', 'cash flow', 'cashflow'],
    change: ['изменить', 'изменение', 'change'],
    balance: ['баланс кошелька', 'wallet balance'],
  };
  const BALANCE_LABELS = HEADERS.balance;
  const DATE_RE = /(\d{4})-(\d{2})-(\d{2})\s*(\d{2}):(\d{2})(?::(\d{2}))?/;
  const DATE_RE_DMY = /(\d{2})[./](\d{2})[./](\d{4})\s*(\d{2}):(\d{2})(?::(\d{2}))?/;

  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function fieldForHeader(text) {
    const n = norm(text);
    if (!n) return null;
    for (const [field, labels] of Object.entries(HEADERS)) {
      if (labels.includes(n)) return field;
    }
    return null;
  }

  function num(s) {
    if (s == null) return null;
    const t = String(s).replace(/[−–]/g, '-').replace(/[,\s ]/g, '');
    if (/^--/.test(t)) return null;
    const m = t.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
    return m ? parseFloat(m[0]) : null;
  }

  function parseTime(text) {
    let m = (text || '').match(DATE_RE);
    if (m) {
      const [, y, mo, d, h, mi, s] = m;
      const str = `${y}-${mo}-${d} ${h}:${mi}:${s || '00'}`;
      return { str, date: `${y}-${mo}-${d}`, ts: new Date(+y, mo - 1, +d, +h, +mi, +(s || 0)).getTime() };
    }
    m = (text || '').match(DATE_RE_DMY);
    if (m) {
      const [, d, mo, y, h, mi, s] = m;
      const str = `${y}-${mo}-${d} ${h}:${mi}:${s || '00'}`;
      return { str, date: `${y}-${mo}-${d}`, ts: new Date(+y, mo - 1, +d, +h, +mi, +(s || 0)).getTime() };
    }
    return null;
  }

  function classifyType(t) {
    const s = norm(t);
    if (/fund|финанс|фандинг/.test(s)) return 'funding';
    if (/liquid|ликвид/.test(s)) return 'liquidation';
    if (/\badl\b|auto-?deleverag/.test(s)) return 'adl';
    if (/deliver|поставк|экспир/.test(s)) return 'delivery';
    if (/transfer|перевод|deposit|withdraw|депозит|вывод/.test(s)) return 'transfer';
    if (/bonus|бонус|airdrop|reward|награ/.test(s)) return 'bonus';
    if (/trade|сделк|торг/.test(s)) return 'trade';
    return 'other';
  }

  // ---------- DOM ----------

  function findHeaderRow(doc) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!BALANCE_LABELS.includes(norm(node.nodeValue))) continue;
      let el = node.parentElement;
      for (let depth = 0; el && depth < 8; depth++, el = el.parentElement) {
        const parent = el.parentElement;
        if (!parent || parent.children.length < 8) continue;
        const fields = Array.from(parent.children).map((c) => fieldForHeader(c.textContent));
        if (fields.filter(Boolean).length >= 6) return { row: parent, fields };
      }
    }
    return null;
  }

  function findDataRows(header) {
    const tag = header.row.tagName;
    const width = header.row.children.length;
    const timeIdx = header.fields.indexOf('time');
    let scope = header.row.parentElement;
    for (let i = 0; scope && i < 8; i++, scope = scope.parentElement) {
      const found = Array.from(scope.getElementsByTagName(tag)).filter((r) => {
        if (r === header.row || r.children.length !== width) return false;
        const cell = r.children[timeIdx >= 0 ? timeIdx : 0];
        return cell && parseTime(cell.textContent);
      });
      if (found.length) return found;
    }
    return [];
  }

  // Достаёт строки текущей страницы. Возвращает массив объектов (по порядку сверху вниз).
  function extractRows(doc) {
    const header = findHeaderRow(doc || document);
    if (!header) return { found: false, rows: [] };
    const rows = [];
    const seen = new Set();
    for (const tr of findDataRows(header)) {
      const cells = Array.from(tr.children).map((c) => c.textContent.replace(/\s+/g, ' ').trim());
      const raw = {};
      header.fields.forEach((f, i) => { if (f && raw[f] == null) raw[f] = cells[i]; });
      const key = cells.join('|');
      if (seen.has(key)) continue; // дубли от фиксированных колонок/виртуализации
      seen.add(key);
      const row = buildRow(raw, key);
      if (row) rows.push(row);
    }
    return { found: true, rows };
  }

  function buildRow(raw, key) {
    const t = parseTime(raw.time);
    if (!t) return null;
    const dir = norm(raw.direction);
    const contractMatch = (raw.contract || '').match(/[A-Z0-9]{2,}[A-Z0-9-]*/);
    const r = {
      key,
      timeStr: t.str,
      date: t.date,
      ts: t.ts,
      currency: (raw.currency || '').trim() || '?',
      contract: contractMatch ? contractMatch[0] : (raw.contract || '?').trim(),
      typeRaw: (raw.type || '').trim(),
      kind: classifyType(raw.type),
      dirRaw: (raw.direction || '').trim(),
      isOpen: /open|откр/.test(dir),
      isClose: /close|закр/.test(dir),
      side: /buy|покуп/.test(dir) ? 'buy' : /sell|прод/.test(dir) ? 'sell' : null,
      qty: num(raw.qty),
      position: num(raw.position),
      price: num(raw.price),
      funding: num(raw.funding) || 0,
      fee: num(raw.fee) || 0,
      cashFlow: num(raw.cashFlow) || 0,
      change: num(raw.change),
      balance: num(raw.balance),
    };
    if (r.change == null) r.change = r.cashFlow - r.fee + r.funding;
    return r;
  }

  // ---------- Аналитика ----------

  const TRADE_LIKE = new Set(['trade', 'liquidation', 'adl', 'delivery']);

  // rows: массив объектов с полем seq (больше seq = ниже в журнале = старее при равном времени).
  function analyze(input) {
    const rows = input.slice().sort((a, b) => a.ts - b.ts || b.seq - a.seq);
    const pnlRows = rows.filter((r) => r.kind !== 'transfer');

    const T = {
      rows: rows.length, net: 0, gross: 0, grossProfit: 0, grossLoss: 0, fees: 0,
      fundingIn: 0, fundingOut: 0, liquidations: 0, liquidationPnl: 0,
      transfersIn: 0, transfersOut: 0, bonus: 0, trades: 0, volume: 0,
      first: rows[0] ? rows[0].timeStr : null,
      last: rows.length ? rows[rows.length - 1].timeStr : null,
    };

    const byContract = new Map();
    const byDay = new Map();
    const getC = (r) => {
      if (!byContract.has(r.contract)) byContract.set(r.contract, {
        contract: r.contract, net: 0, gross: 0, fees: 0, funding: 0, trades: 0, volume: 0,
        liquidations: 0, rounds: 0, wins: 0, losses: 0,
      });
      return byContract.get(r.contract);
    };
    const getD = (r) => {
      if (!byDay.has(r.date)) byDay.set(r.date, { date: r.date, net: 0, gross: 0, fees: 0, funding: 0, trades: 0 });
      return byDay.get(r.date);
    };

    // Кривая PnL и просадка
    const curve = [];
    let cum = 0;

    for (const r of rows) {
      if (r.kind === 'transfer') {
        if (r.change >= 0) T.transfersIn += r.change; else T.transfersOut += r.change;
        continue;
      }
      const c = getC(r);
      const d = getD(r);
      T.net += r.change; c.net += r.change; d.net += r.change;
      T.fees += r.fee; c.fees += r.fee; d.fees += r.fee;
      c.funding += r.funding; d.funding += r.funding;
      if (r.funding > 0) T.fundingIn += r.funding; else T.fundingOut += r.funding;
      if (TRADE_LIKE.has(r.kind)) {
        T.gross += r.cashFlow; c.gross += r.cashFlow; d.gross += r.cashFlow;
        if (r.cashFlow > 0) T.grossProfit += r.cashFlow; else T.grossLoss += r.cashFlow;
        T.trades++; c.trades++; d.trades++;
        const vol = (r.qty || 0) * (r.price || 0);
        T.volume += vol; c.volume += vol;
      }
      if (r.kind === 'liquidation') { T.liquidations++; c.liquidations++; T.liquidationPnl += r.change; }
      if (r.kind === 'bonus') T.bonus += r.change;
      cum += r.change;
      curve.push({ ts: r.ts, cum });
    }

    // Стартовый/конечный баланс по колонке «Баланс кошелька»
    const withBal = rows.filter((r) => r.balance != null);
    const startBalance = withBal.length ? withBal[0].balance - withBal[0].change : null;
    const endBalance = withBal.length ? withBal[withBal.length - 1].balance : null;
    T.startBalance = startBalance;
    T.endBalance = endBalance;
    T.roi = startBalance ? (T.net / startBalance) * 100 : null;
    T.balanceChangePct = startBalance ? ((endBalance - startBalance) / startBalance) * 100 : null;

    // Макс. просадка по эквити = старт + накопленный PnL
    let peak = startBalance || 0, maxDd = 0, maxDdPct = 0;
    for (const p of curve) {
      const eq = (startBalance || 0) + p.cum;
      if (eq > peak) peak = eq;
      const dd = peak - eq;
      if (dd > maxDd) { maxDd = dd; maxDdPct = peak > 0 ? (dd / peak) * 100 : 0; }
    }
    T.maxDrawdown = maxDd;
    T.maxDrawdownPct = startBalance ? maxDdPct : null;

    // Сделки «от открытия до закрытия» (позиция вернулась в 0)
    const rounds = [];
    const open = new Map();
    for (const r of pnlRows) {
      if (r.kind === 'bonus' || r.kind === 'other') continue;
      let cur = open.get(r.contract);
      if (!cur) {
        let side = null;
        if (r.isOpen) side = r.side === 'buy' ? 'Long' : 'Short';
        else if (r.isClose || TRADE_LIKE.has(r.kind)) side = r.side === 'buy' ? 'Short' : 'Long';
        else if (r.position != null) side = r.position < 0 ? 'Short' : 'Long';
        cur = {
          contract: r.contract, side, partial: !(r.isOpen && r.kind === 'trade'),
          startTs: r.ts, start: r.timeStr, endTs: null, end: null,
          gross: 0, fees: 0, funding: 0, net: 0, fills: 0, maxPos: 0,
          liquidated: false, entryCost: 0, entryQty: 0, exitCost: 0, exitQty: 0,
        };
        open.set(r.contract, cur);
      }
      cur.net += r.change;
      cur.fees += r.fee;
      cur.funding += r.funding;
      if (TRADE_LIKE.has(r.kind)) {
        cur.gross += r.cashFlow;
        cur.fills++;
        if (r.qty && r.price) {
          if (r.isOpen) { cur.entryCost += r.qty * r.price; cur.entryQty += r.qty; }
          else { cur.exitCost += r.qty * r.price; cur.exitQty += r.qty; }
        }
      }
      if (r.position != null) cur.maxPos = Math.max(cur.maxPos, Math.abs(r.position));
      if (r.kind === 'liquidation') cur.liquidated = true;
      if (TRADE_LIKE.has(r.kind) && !r.isOpen && r.position === 0) {
        cur.endTs = r.ts; cur.end = r.timeStr; cur.closed = true;
        rounds.push(cur);
        open.delete(r.contract);
      }
    }
    for (const cur of open.values()) { cur.closed = false; rounds.push(cur); }
    for (const rd of rounds) {
      rd.avgEntry = rd.entryQty ? rd.entryCost / rd.entryQty : null;
      rd.avgExit = rd.exitQty ? rd.exitCost / rd.exitQty : null;
      rd.notional = rd.avgEntry ? rd.avgEntry * rd.maxPos : null;
      rd.pctOfNotional = rd.notional ? (rd.net / rd.notional) * 100 : null;
      rd.durationMs = rd.closed && !rd.partial ? rd.endTs - rd.startTs : null;
    }

    const closed = rounds.filter((r) => r.closed).sort((a, b) => a.endTs - b.endTs);
    const wins = closed.filter((r) => r.net > 0);
    const losses = closed.filter((r) => r.net <= 0);
    const sumW = wins.reduce((s, r) => s + r.net, 0);
    const sumL = losses.reduce((s, r) => s + r.net, 0);
    let streakW = 0, streakL = 0, cw = 0, cl = 0;
    for (const r of closed) {
      if (r.net > 0) { cw++; cl = 0; } else { cl++; cw = 0; }
      streakW = Math.max(streakW, cw); streakL = Math.max(streakL, cl);
    }
    for (const r of closed) {
      const c = byContract.get(r.contract);
      if (!c) continue;
      c.rounds++;
      if (r.net > 0) c.wins++; else c.losses++;
    }
    const durations = closed.map((r) => r.durationMs).filter((x) => x != null);
    const sideStats = (side) => {
      const list = closed.filter((r) => r.side === side);
      return { count: list.length, net: list.reduce((s, r) => s + r.net, 0), wins: list.filter((r) => r.net > 0).length };
    };

    const R = {
      closed: closed.length,
      open: rounds.filter((r) => !r.closed).length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : null,
      sumWins: sumW,
      sumLosses: sumL,
      avgWin: wins.length ? sumW / wins.length : null,
      avgLoss: losses.length ? sumL / losses.length : null,
      profitFactor: sumL ? sumW / Math.abs(sumL) : (sumW > 0 ? Infinity : null),
      expectancy: closed.length ? (sumW + sumL) / closed.length : null,
      best: closed.reduce((b, r) => (!b || r.net > b.net ? r : b), null),
      worst: closed.reduce((b, r) => (!b || r.net < b.net ? r : b), null),
      streakWins: streakW,
      streakLosses: streakL,
      avgDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
      long: sideStats('Long'),
      short: sideStats('Short'),
    };

    return {
      totals: T,
      rounds: R,
      roundList: rounds.slice().sort((a, b) => (b.endTs || b.startTs) - (a.endTs || a.startTs)),
      byContract: Array.from(byContract.values()).sort((a, b) => b.net - a.net),
      byDay: Array.from(byDay.values()).sort((a, b) => (a.date < b.date ? 1 : -1)),
      curve,
    };
  }

  function toCsv(rows) {
    const cols = ['timeStr', 'currency', 'contract', 'typeRaw', 'dirRaw', 'qty', 'position', 'price',
      'funding', 'fee', 'cashFlow', 'change', 'balance'];
    const esc = (v) => (v == null ? '' : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const sorted = rows.slice().sort((a, b) => b.ts - a.ts || a.seq - b.seq);
    return [cols.join(','), ...sorted.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  }

  const api = { extractRows, buildRow, analyze, toCsv, num, parseTime, classifyType, fieldForHeader };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BybitPnlParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
