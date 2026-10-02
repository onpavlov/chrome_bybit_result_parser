// UI: floating button + summary panel on top of the Transaction Log page.
(() => {
  'use strict';
  if (window.__bybitPnlLoaded) return;
  window.__bybitPnlLoaded = true;

  const P = window.BybitPnlParser;
  const I18N = window.BybitPnlI18n;
  const STORE_KEY = 'bybitPnlRows';
  const LANG_KEY = 'bybitPnlLang';
  let t = I18N.make(I18N.DEFAULT);

  let rows = new Map();      // key -> row (accumulated from every page viewed)
  let pageCounter = 0;
  let lastPageSig = '';
  let currency = null;
  let panelOpen = false;
  let collecting = false;
  let stopRequested = false;
  let tab = 'summary';

  // ---------- storage ----------
  const load = () => new Promise((res) => {
    try {
      chrome.storage.local.get([STORE_KEY, LANG_KEY], (d) => {
        t = I18N.make((d && d[LANG_KEY]) || I18N.DEFAULT);
        const saved = (d && d[STORE_KEY]) || {};
        rows = new Map((saved.rows || []).map((r) => [r.key, r]));
        pageCounter = saved.pageCounter || 0;
        res();
      });
    } catch (e) { res(); }
  });
  const save = () => {
    try { chrome.storage.local.set({ [STORE_KEY]: { rows: Array.from(rows.values()), pageCounter } }); } catch (e) { /* ignore */ }
  };

  // ---------- collecting ----------
  function scanPage() {
    const { found, rows: pageRows } = P.extractRows(document);
    if (!found) return { found: false, added: 0, sig: '' };
    const sig = pageRows.map((r) => r.key).join('\n');
    if (sig && sig !== lastPageSig) { pageCounter++; lastPageSig = sig; }
    let added = 0;
    pageRows.forEach((r, i) => {
      if (rows.has(r.key)) return;
      r.seq = pageCounter * 10000 + i;
      rows.set(r.key, r);
      added++;
    });
    if (added) save();
    return { found: true, added, sig, count: pageRows.length };
  }

  function findNextButton() {
    const labels = ['далее', 'next', 'следующая', 'вперёд', 'вперед'];
    const els = document.querySelectorAll('button, a, li, div[role="button"], span');
    for (const el of els) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (labels.includes(t) && !el.closest('#bybit-pnl-host')) {
        return el.closest('button, a, li, [role="button"]') || el;
      }
    }
    return document.querySelector('.ant-pagination-next, [class*="pagination-next"]');
  }
  const isDisabled = (el) => !el || el.disabled || el.getAttribute('aria-disabled') === 'true' ||
    /disabled/i.test(el.className || '') || !!el.closest('[class*="disabled"], [disabled]');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function collectAll() {
    if (collecting) return;
    collecting = true; stopRequested = false;
    let pages = 0;
    try {
      let { sig } = scanPage();
      pages++;
      render(t('collecting', { pages, rows: rows.size }));
      while (!stopRequested && pages < 1000) {
        const next = findNextButton();
        if (isDisabled(next)) break;
        next.click();
        let changed = false;
        for (let i = 0; i < 60 && !stopRequested; i++) {
          await sleep(200);
          const { rows: cur } = P.extractRows(document);
          const s = cur.map((r) => r.key).join('\n');
          if (s && s !== sig) { changed = true; break; }
        }
        if (!changed) break;
        await sleep(300); // let the page finish rendering
        sig = scanPage().sig;
        pages++;
        render(t('collecting', { pages, rows: rows.size }));
      }
    } finally {
      collecting = false;
      render(t(stopRequested ? 'stopped' : 'done', { pages }));
    }
  }

  // ---------- formatting ----------
  const fmt = (n, d = 4, sign = true) => {
    if (n == null || Number.isNaN(n)) return '—';
    if (n === Infinity) return '∞';
    const s = Math.abs(n).toLocaleString(t.locale, { minimumFractionDigits: d, maximumFractionDigits: d });
    return (n < 0 ? '−' : sign && n > 0 ? '+' : '') + s;
  };
  const pct = (n) => (n == null ? '—' : fmt(n, 2) + '%');
  const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dur = (ms) => {
    if (ms == null) return '—';
    const m = Math.round(ms / 60000);
    if (m < 60) return t('min', { m });
    const h = Math.floor(m / 60);
    if (h < 48) return t('hm', { h, m: m % 60 });
    return t('dh', { d: Math.floor(h / 24), h: h % 24 });
  };
  const money = (n, d = 4) => `<span class="${cls(n)}">${fmt(n, d)}</span>`;

  // ---------- UI ----------
  const host = document.createElement('div');
  host.id = 'bybit-pnl-host';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${CSS()}</style>
    <button class="fab">📊 PnL</button>
    <div class="panel" hidden></div>`;
  const fab = shadow.querySelector('.fab');
  const panel = shadow.querySelector('.panel');
  fab.title = t('fabTitle');

  fab.addEventListener('click', () => toggle());
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'close') toggle(false);
    else if (act === 'collect') collectAll();
    else if (act === 'stop') stopRequested = true;
    else if (act === 'rescan') { scanPage(); render(); }
    else if (act === 'reset') { rows.clear(); pageCounter = 0; lastPageSig = ''; save(); scanPage(); render(t('resetDone')); }
    else if (act === 'csv') downloadCsv();
    else if (act === 'tab') { tab = a.dataset.tab; render(); }
    else if (act === 'lang') {
      const langs = I18N.languages;
      t = I18N.make(langs[(langs.indexOf(t.lang) + 1) % langs.length]);
      fab.title = t('fabTitle');
      try { chrome.storage.local.set({ [LANG_KEY]: t.lang }); } catch (err) { /* ignore */ }
      render();
    }
  });
  panel.addEventListener('change', (e) => {
    if (e.target.matches('select.cur')) { currency = e.target.value; render(); }
  });

  function toggle(force) {
    panelOpen = force ?? !panelOpen;
    panel.hidden = !panelOpen;
    if (panelOpen) { scanPage(); render(); }
  }

  function downloadCsv() {
    const list = Array.from(rows.values()).filter((r) => !currency || r.currency === currency);
    const blob = new Blob(['﻿' + P.toCsv(list)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bybit-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function render(status) {
    if (!panelOpen) return;
    const all = Array.from(rows.values());
    const currencies = [...new Set(all.map((r) => r.currency))];
    if (!currency || !currencies.includes(currency)) {
      const freq = {};
      all.forEach((r) => { freq[r.currency] = (freq[r.currency] || 0) + 1; });
      currency = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] || null;
    }
    const list = all.filter((r) => r.currency === currency);
    const head = `
      <div class="head">
        <b>${t('title')}</b>
        ${currencies.length > 1 ? `<select class="cur">${currencies.map((c) => `<option ${c === currency ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : `<span class="muted">${esc(currency || '')}</span>`}
        <span class="sp"></span>
        <button data-act="lang" class="lang" title="${t('langTitle')}">${t.lang.toUpperCase()}</button>
        <button data-act="close" class="x" title="${t('close')}">×</button>
      </div>
      <div class="bar">
        ${collecting ? `<button data-act="stop" class="warn">${t('stop')}</button>` : `<button data-act="collect" class="pri" title="${t('collectTitle')}">${t('collect')}</button>`}
        <button data-act="rescan" title="${t('rescanTitle')}">↻</button>
        <button data-act="csv">CSV</button>
        <button data-act="reset" title="${t('resetTitle')}">${t('reset')}</button>
      </div>
      <div class="status">${esc(status || '')} ${t('collected')} <b>${list.length}</b>${list.length ? ` · ${esc(list.reduce((m, r) => (r.ts < m.ts ? r : m)).timeStr)} → ${esc(list.reduce((m, r) => (r.ts > m.ts ? r : m)).timeStr)}` : ''}</div>`;

    if (!list.length) {
      panel.innerHTML = head + `<div class="empty">${t('empty')}</div>`;
      return;
    }

    const A = P.analyze(list);
    const tabs = [['summary', t('tabSummary')], ['contracts', t('tabContracts')], ['rounds', t('tabRounds')], ['days', t('tabDays')]];
    let body = '';
    if (tab === 'summary') body = renderSummary(A);
    else if (tab === 'contracts') body = renderContracts(A);
    else if (tab === 'rounds') body = renderRounds(A);
    else body = renderDays(A);

    panel.innerHTML = head +
      `<div class="tabs">${tabs.map(([k, n]) => `<button data-act="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>` +
      `<div class="body">${body}</div>`;
  }

  function renderSummary(A) {
    const T = A.totals, R = A.rounds;
    const plus = A.byContract.filter((c) => c.net > 0);
    const minus = A.byContract.filter((c) => c.net < 0);
    const names = (list, total) => list.map((c) => esc(c.contract.replace(/USDT$|USDC$/, ''))).join(', ') + (total > 3 ? '…' : '');
    const kpi = (label, val, sub = '') => `<div class="kpi"><div class="l">${label}</div><div class="v">${val}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    return `
      <div class="kpis">
        ${kpi(t('netPnl'), money(T.net), t('netPnlSub'))}
        ${kpi(t('roi'), `<span class="${cls(T.roi)}">${pct(T.roi)}</span>`, t('roiSub', { bal: fmt(T.startBalance, 2, false) }))}
        ${kpi(t('profit'), money(plus.reduce((s, c) => s + c.net, 0)), t('profitSub', { n: plus.length, list: names(plus.slice(0, 3), plus.length) }))}
        ${kpi(t('loss'), money(minus.reduce((s, c) => s + c.net, 0)), t('lossSub', { n: minus.length, list: names(minus.slice(-3).reverse(), minus.length) }))}
      </div>
      ${sparkline(A.curve)}
      <h4>${t('breakdown')}</h4>
      <table class="kv">
        <tr><td>${t('grossProfit')}</td><td>${money(T.grossProfit)}</td></tr>
        <tr><td>${t('grossLoss')}</td><td>${money(T.grossLoss)}</td></tr>
        <tr><td>${t('realized')}</td><td>${money(T.gross)}</td></tr>
        <tr><td>${t('fees')}</td><td>${money(-T.fees)}</td></tr>
        <tr><td>${t('fundingIn')}</td><td>${money(T.fundingIn)}</td></tr>
        <tr><td>${t('fundingOut')}</td><td>${money(T.fundingOut)}</td></tr>
        ${T.bonus ? `<tr><td>${t('bonus')}</td><td>${money(T.bonus)}</td></tr>` : ''}
        <tr class="tot"><td>${t('total')}</td><td>${money(T.net)}</td></tr>
        ${T.liquidations ? `<tr><td>${t('liquidations')}</td><td><span class="neg">${T.liquidations}</span> (${fmt(T.liquidationPnl)})</td></tr>` : ''}
        ${T.transfersIn || T.transfersOut ? `<tr><td>${t('transfers')}</td><td>${fmt(T.transfersIn)} / ${fmt(T.transfersOut)}</td></tr>` : ''}
      </table>
      <h4>${t('balance')}</h4>
      <table class="kv">
        <tr><td>${t('startBal')}</td><td>${fmt(T.startBalance, 4, false)}</td></tr>
        <tr><td>${t('endBal')}</td><td>${fmt(T.endBalance, 4, false)}</td></tr>
        <tr><td>${t('balChange')}</td><td><span class="${cls(T.balanceChangePct)}">${pct(T.balanceChangePct)}</span></td></tr>
        <tr><td>${t('maxDd')}</td><td><span class="neg">${fmt(-T.maxDrawdown)}</span> (${T.maxDrawdownPct == null ? '—' : fmt(-T.maxDrawdownPct, 3) + '%'})</td></tr>
      </table>
      <h4>${t('tradeStats')}</h4>
      <table class="kv">
        <tr><td>${t('closedOpen')}</td><td>${R.closed} / ${R.open}</td></tr>
        <tr><td>${t('closedPnl')}</td><td>${money(R.sumWins)} / ${money(R.sumLosses)}</td></tr>
        <tr><td>${t('winRate')}</td><td>${R.winRate == null ? '—' : fmt(R.winRate, 1, false) + '%'}</td></tr>
        <tr><td>${t('profitFactor')}</td><td>${R.profitFactor == null ? '—' : fmt(R.profitFactor, 2, false)}</td></tr>
        <tr><td>${t('avgWinLoss')}</td><td>${money(R.avgWin)} / ${money(R.avgLoss)}</td></tr>
        <tr><td>${t('expectancy')}</td><td>${money(R.expectancy)}</td></tr>
        <tr><td>${t('best')}</td><td>${R.best ? `${esc(R.best.contract)} ${money(R.best.net)}` : '—'}</td></tr>
        <tr><td>${t('worst')}</td><td>${R.worst ? `${esc(R.worst.contract)} ${money(R.worst.net)}` : '—'}</td></tr>
        <tr><td>${t('streaks')}</td><td>${R.streakWins} / ${R.streakLosses}</td></tr>
        <tr><td>${t('avgHold')}</td><td>${dur(R.avgDurationMs)}</td></tr>
        <tr><td>${t('longStats')}</td><td>${R.long.count} (${t('inProfit', { n: R.long.wins })}) / ${money(R.long.net)}</td></tr>
        <tr><td>${t('shortStats')}</td><td>${R.short.count} (${t('inProfit', { n: R.short.wins })}) / ${money(R.short.net)}</td></tr>
        <tr><td>${t('fillsVolume')}</td><td>${T.trades} / ${fmt(T.volume, 2, false)}</td></tr>
        <tr><td>${t('feesShare')}</td><td>${T.grossProfit ? fmt((T.fees / T.grossProfit) * 100, 1, false) + '%' : '—'}</td></tr>
      </table>`;
  }

  function renderContracts(A) {
    return `<table class="grid">
      <thead><tr><th>${t('colContract')}</th><th>${t('colNet')}</th><th>${t('colPnl')}</th><th>${t('colFees')}</th><th>${t('colFunding')}</th><th>${t('colWinLoss')}</th></tr></thead>
      <tbody>${A.byContract.map((c) => `<tr>
        <td>${esc(c.contract)}${c.liquidations ? ` <span class="neg" title="${t('liqTitle')}">⚠</span>` : ''}</td>
        <td>${money(c.net)}</td><td>${money(c.gross)}</td><td>${money(-c.fees)}</td><td>${money(c.funding)}</td>
        <td>${c.wins}/${c.losses}</td></tr>`).join('')}</tbody></table>`;
  }

  function renderRounds(A) {
    return `<p class="muted">${t('roundsNote')}</p>
      <table class="grid">
      <thead><tr><th>${t('colContract')}</th><th>${t('colSide')}</th><th>${t('colNet')}</th><th>${t('colPct')}</th><th>${t('colEntryExit')}</th><th>${t('colTime')}</th></tr></thead>
      <tbody>${A.roundList.map((r) => `<tr class="${r.closed ? '' : 'openrow'}">
        <td>${esc(r.contract)}${r.partial ? '*' : ''}${r.liquidated ? ` <span class="neg" title="${t('liqTitle')}">⚠</span>` : ''}</td>
        <td><span class="${r.side === 'Long' ? 'pos' : 'neg'}">${r.side || '?'}</span></td>
        <td>${money(r.net)}<div class="s">PnL ${fmt(r.gross)} · ${t('feeShort')} ${fmt(-r.fees)}${r.funding ? ` · ${t('fundShort')} ${fmt(r.funding)}` : ''}</div></td>
        <td><span class="${cls(r.pctOfNotional)}">${pct(r.pctOfNotional)}</span></td>
        <td>${r.avgEntry ? fmtPrice(r.avgEntry) : '—'} → ${r.avgExit ? fmtPrice(r.avgExit) : '—'}</td>
        <td>${r.closed ? esc(r.end.slice(5, 16)) + `<div class="s">${dur(r.durationMs)}</div>` : `<b>${t('open')}</b>`}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  const fmtPrice = (p) => p.toLocaleString(t.locale, { maximumSignificantDigits: 6 });

  function renderDays(A) {
    return `<table class="grid">
      <thead><tr><th>${t('colDate')}</th><th>${t('colNet')}</th><th>${t('colPnl')}</th><th>${t('colFees')}</th><th>${t('colFunding')}</th><th>${t('colFills')}</th></tr></thead>
      <tbody>${A.byDay.map((d) => `<tr><td>${esc(d.date)}</td><td>${money(d.net)}</td><td>${money(d.gross)}</td>
        <td>${money(-d.fees)}</td><td>${money(d.funding)}</td><td>${d.trades}</td></tr>`).join('')}</tbody></table>`;
  }

  function sparkline(curve) {
    if (curve.length < 2) return '';
    const W = 460, H = 90, pad = 4;
    const xs = curve.map((p) => p.ts), ys = curve.map((p) => p.cum).concat(0);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1;
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const X = (t) => pad + ((t - x0) / (x1 - x0 || 1)) * (W - 2 * pad);
    const Y = (v) => H - pad - ((v - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
    const pts = curve.map((p) => `${X(p.ts).toFixed(1)},${Y(p.cum).toFixed(1)}`).join(' ');
    const last = curve[curve.length - 1].cum;
    return `<div class="chart"><div class="l">${t('cumPnl')}</div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="zero"/>
        <polyline points="${pts}" class="${last >= 0 ? 'lp' : 'ln'}"/>
      </svg></div>`;
  }

  function CSS() {
    return `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: Inter, -apple-system, system-ui, sans-serif; }
    .fab { position: fixed; right: 20px; bottom: 24px; z-index: 2147483646; border: 0; border-radius: 22px;
      padding: 10px 16px; background: #f7a600; color: #111; font-weight: 600; font-size: 14px; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.25); }
    .fab:hover { filter: brightness(1.05); }
    .fab[hidden] { display: none; }
    .panel { position: fixed; top: 16px; right: 16px; bottom: 16px; width: 540px; max-width: calc(100vw - 32px);
      z-index: 2147483647; background: #fff; color: #121214; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,.3);
      display: flex; flex-direction: column; font-size: 13px; overflow: hidden; }
    .panel[hidden] { display: none; }
    .head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 6px; font-size: 15px; }
    .sp { flex: 1; }
    .lang { border: 1px solid #ddd; background: none; border-radius: 6px; padding: 2px 7px; font-size: 11px; font-weight: 600; cursor: pointer; color: inherit; }
    .x { border: 0; background: none; font-size: 22px; cursor: pointer; color: #888; line-height: 1; }
    .bar { display: flex; gap: 6px; padding: 4px 14px; flex-wrap: wrap; }
    .bar button, .tabs button { border: 1px solid #ddd; background: #f6f6f7; border-radius: 6px; padding: 5px 10px;
      cursor: pointer; font-size: 12px; color: inherit; }
    .bar .pri { background: #f7a600; border-color: #f7a600; font-weight: 600; color: #111; }
    .bar .warn { background: #f6465d; border-color: #f6465d; color: #fff; }
    .status { padding: 4px 14px 8px; color: #777; font-size: 12px; }
    .tabs { display: flex; gap: 4px; padding: 0 14px 8px; border-bottom: 1px solid #eee; }
    .tabs button.on { background: #121214; color: #fff; border-color: #121214; }
    .body { overflow: auto; padding: 10px 14px 16px; flex: 1; }
    .empty { padding: 24px 14px; color: #777; }
    .pos { color: #20b26c; } .neg { color: #ef454a; }
    .muted { color: #888; font-size: 12px; }
    .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .kpi { background: #f6f6f7; border-radius: 8px; padding: 10px; }
    .kpi .l { color: #777; font-size: 11px; } .kpi .v { font-size: 18px; font-weight: 600; margin-top: 2px; }
    .kpi .s, .s { color: #999; font-size: 11px; }
    h4 { margin: 14px 0 6px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    .kv td { padding: 4px 0; border-bottom: 1px solid #f1f1f1; } .kv td:last-child { text-align: right; white-space: nowrap; }
    .kv .tot td { font-weight: 600; border-top: 2px solid #ddd; }
    .grid th { text-align: left; color: #777; font-weight: 500; font-size: 11px; padding: 4px 4px; border-bottom: 1px solid #eee; position: sticky; top: -10px; background: #fff; }
    .grid td { padding: 6px 4px; border-bottom: 1px solid #f1f1f1; vertical-align: top; white-space: nowrap; }
    .grid tr.openrow td { background: #fffaf0; }
    .chart { margin-top: 10px; background: #f6f6f7; border-radius: 8px; padding: 8px 10px; }
    .chart .l { color: #777; font-size: 11px; }
    .chart svg { width: 100%; height: 90px; display: block; }
    .chart .zero { stroke: #ccc; stroke-dasharray: 3 3; stroke-width: 1; }
    .chart polyline { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; }
    .chart .lp { stroke: #20b26c; } .chart .ln { stroke: #ef454a; }
    select { font-size: 12px; padding: 2px 4px; }
    @media (prefers-color-scheme: dark) {
      .panel { background: #17181e; color: #eaecef; }
      .kpi, .chart, .bar button, .tabs button { background: #22232a; border-color: #33343c; }
      .tabs button.on { background: #eaecef; color: #17181e; }
      .grid th { background: #17181e; } .tabs, .grid th { border-color: #2a2b33; }
      .kv td, .grid td { border-color: #24252c; } .grid tr.openrow td { background: #2a2416; }
    }`;
  }

  // ---------- startup ----------
  chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === 'bybit-pnl-toggle') toggle(); });

  load().then(() => {
    document.documentElement.appendChild(host);
    fab.hidden = true;
    let timer = null;
    const check = () => {
      const { found } = P.extractRows(document);
      fab.hidden = !found && !panelOpen;
      if (found && panelOpen && !collecting) {
        const res = scanPage();
        if (res.added) render();
      }
    };
    // Watch the table (page or filter changes): new rows are added automatically.
    new MutationObserver((muts) => {
      if (muts.every((m) => host.contains(m.target) || m.target === host)) return;
      clearTimeout(timer);
      timer = setTimeout(check, 700);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    check();
  });
})();
