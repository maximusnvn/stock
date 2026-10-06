// Auto-update dashboard_data.js — chay boi GitHub Actions moi ngay sau phien
// Su dung VNDirect Dchart (gia) + VNDirect Finfo (BCTC & chi so co ban)
const fs = require('fs');

// Guard: neu trinh duyet da phat hanh hom nay roi thi bo qua, khoi commit trung
try {
  const cur0 = fs.readFileSync('dashboard_data.js', 'utf8');
  const mo0 = cur0.match(/"updated":"(\d{4}-\d{2}-\d{2})/);
  const vn0 = new Date(Date.now() + (7*60 + new Date().getTimezoneOffset())*60000);
  if (mo0 && mo0[1] === vn0.toISOString().slice(0,10)) { console.log('Da tuoi (' + mo0[1] + '), bo qua.'); process.exit(0); }
} catch(e) {}

const FF = 'https://api-finfo.vndirect.com.vn/v4/';
const MA_TL = 'PRICE_TO_EARNINGS,PRICE_TO_BOOK,MARKETCAP,DIVIDEND_YIELD,ROAE_TR_AVG4Q,ROAA_TR_AVG4Q,GROSS_MARGIN_TR,DEBT_TO_EQUITY_AQ,NET_SALES_QR_GRYOY,NET_PROFIT_QR_GRYOY';
const TRUONG = ['pe','pb','cap','dy','roe','roa','gm','dte','revYoY','npatYoY','cagr3','q'];
function so(v){ var n = +v; return isFinite(n) ? n : null; }
function lam(v, d){ if (v == null) return null; var m = Math.pow(10, d); return Math.round(v * m) / m; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function ngayDauQuy(nQuyTruoc){
  var d = new Date(); var idx = d.getUTCFullYear()*4 + Math.ceil((d.getUTCMonth()+1)/3) - 1 - nQuyTruoc;
  var y = Math.floor(idx/4), q = idx % 4 + 1;
  return y + '-' + ('0' + ((q-1)*3 + 1)).slice(-2) + '-01';
}

async function jget(u, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(u, { headers: { 'accept': '*/*', 'user-agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { if (i === tries - 1) throw e; await sleep(800 * (i + 1)); }
  }
}

async function boSungLo(codes){
  var w = codes.join(',');
  var kq = await Promise.all([
    jget(FF + 'ratios/latest?order=reportDate&filter=ratioCode:' + MA_TL + '&where=code:' + w + '&size=' + (codes.length*12)),
    jget(FF + 'financial_statements?q=code:' + w + '~reportType:QUARTER~itemCode:21001,421701,23000~fiscalDate:gte:' + ngayDauQuy(17) + '&sort=fiscalDate&size=' + (codes.length*3*18))
  ]);
  var tl = kq[0], bc = kq[1], out = {};
  (tl.data || []).forEach(function(x){
    var v = so(x.value); if (v == null || !x.code) return; var o = out[x.code] || (out[x.code] = {});
    switch (x.ratioCode) {
      case 'PRICE_TO_EARNINGS': o.pe = lam(v, 2); break;      case 'PRICE_TO_BOOK': o.pb = lam(v, 2); break;
      case 'MARKETCAP': o.cap = Math.round(v/1e9); break;     case 'DIVIDEND_YIELD': o.dy = lam(v*100, 1); break;
      case 'ROAE_TR_AVG4Q': o.roe = lam(v*100, 1); break;     case 'ROAA_TR_AVG4Q': o.roa = lam(v*100, 1); break;
      case 'GROSS_MARGIN_TR': o.gm = lam(v*100, 1); break;    case 'DEBT_TO_EQUITY_AQ': o.dte = lam(v, 2); break;
      case 'NET_SALES_QR_GRYOY': o.revYoY = lam(v*100, 1); break; case 'NET_PROFIT_QR_GRYOY': o.npatYoY = lam(v*100, 1); break;
    }
  });
  var quy = {};
  (bc.data || []).forEach(function(x){
    var d = String(x.fiscalDate || '').slice(0,10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !x.code) return;
    var y = +d.slice(0,4), q = Math.ceil(+d.slice(5,7)/3), k = y*4 + q, ic = Math.round(+x.itemCode), v = so(x.numericValue);
    var m = quy[x.code] || (quy[x.code] = {}); var o = m[k] || (m[k] = { y: y, q: q, rev: 0, np: null });
    if (ic === 21001 || ic === 421701) { if (v) o.rev = v; } else if (ic === 23000) o.np = v;
  });
  Object.keys(quy).forEach(function(c){
    var o = out[c] || (out[c] = {});
    var ds = Object.keys(quy[c]).map(Number).sort(function(a,b){ return a-b; }).map(function(k){ return quy[c][k]; }).filter(function(z){ return z.np != null; });
    if (ds.length) o.q = ds.slice(-9).map(function(z){ return [z.y, z.q, z.rev, z.np]; });
    if (ds.length >= 16) { var n = ds.length, ttm = 0, ttm3 = 0;
      for (var i = 0; i < 4; i++) { ttm += ds[n-1-i].np; ttm3 += ds[n-13-i].np; }
      if (ttm > 0 && ttm3 > 0) o.cagr3 = lam((Math.pow(ttm/ttm3, 1/3) - 1)*100, 1); }
  });
  return out;
}

function sma(a, n) { return a.length >= n ? a.slice(-n).reduce((x, y) => x + y, 0) / n : null; }
function rsiLast(c, n = 14) {
  if (c.length < n + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i-1]; g += Math.max(d, 0); l += Math.max(-d, 0); }
  g /= n; l /= n;
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i-1];
    g = (g * (n-1) + Math.max(d, 0)) / n; l = (l * (n-1) + Math.max(-d, 0)) / n;
  }
  return 100 - 100 / (1 + g / (l || 1e-9));
}

(async () => {
  const src = fs.readFileSync('dashboard_data.js', 'utf8');
  const j0 = src.indexOf('=') + 1;
  const SUM = JSON.parse(src.slice(j0).trim().replace(/;\s*$/, ''));
  const list = SUM.rows.map(r => ({ t: r.t, b: r.b, n: r.n }));
  const now = Math.floor(Date.now() / 1000) + 86400;
  const out = [];
  const CONC = 8;

  async function onePrice(tk) {
    try {
      const oh = await jget(`https://dchart-api.vndirect.com.vn/dchart/history?symbol=${tk.t}&resolution=D&from=${now - 86400 * 420}&to=${now}`);
      const c = oh.c || [], v = oh.v || [], o = { t: tk.t, b: tk.b, n: tk.n };
      if (c.length > 30) {
        const last = c[c.length - 1]; o.p = last;
        o.chg = c[c.length - 2] ? +((last / c[c.length - 2] - 1) * 100).toFixed(2) : null;
        o.hi52 = Math.max(...c); o.lo52 = Math.min(...c); o.dHi = +((last / o.hi52 - 1) * 100).toFixed(1);
        o.ma20 = +(last / sma(c, 20) - 1).toFixed(3);
        o.ma50 = c.length >= 50 ? +(last / sma(c, 50) - 1).toFixed(3) : null;
        o.ma200 = c.length >= 200 ? +(last / sma(c, 200) - 1).toFixed(3) : null;
        const rr = rsiLast(c); o.rsi = rr != null ? Math.round(rr) : null;
        o.v20 = Math.round(sma(v, 20) || 0); o.vx = o.v20 ? +(v[v.length - 1] / o.v20).toFixed(2) : null;
        o.val20 = Math.round((sma(v, 20) || 0) * last / 1000);
        const ret = n2 => c.length > n2 ? +((last / c[c.length - 1 - n2] - 1) * 100).toFixed(1) : null;
        o.r3 = ret(63); o.r6 = ret(126); o.r12 = ret(250);
        // vung theo doi (nen chat, khong cay bung no, thanh khoan dat)
        if (c.length > 32 && (o.val20 || 0) >= 15000) {
          const thr = o.b === 'HN' ? 8.8 : 6.3; const L2 = c.length - 1;
          let hi = -1e9, lo = 1e9, hc = false;
          for (let k = L2 - 29; k <= L2; k++) { if (c[k] > hi) hi = c[k]; if (c[k] < lo) lo = c[k]; if (k > 0 && (c[k] / c[k-1] - 1) * 100 >= thr) hc = true; }
          const rng = (hi - lo) / lo * 100;
          if (!hc && rng <= 12) { o.watch = 1; o.wrng = +rng.toFixed(1); o.wdb = +((c[L2] / hi - 1) * 100).toFixed(1); }
        }
      }
      out.push(o);
    } catch (e) { /* skip ma loi */ }
  }

  console.log('Fetching price history for ' + list.length + ' stocks...');
  for (let i = 0; i < list.length; i += CONC) {
    await Promise.all(list.slice(i, i + CONC).map(onePrice));
    if (i % 80 === 0) console.log(`${Math.min(i + CONC, list.length)}/${list.length}...`);
  }

  if (out.length < 600) { console.error(`CHI KEO DUOC ${out.length} MA — HUY, giu data cu.`); process.exit(1); }

  // Batch fetch fundamentals from VNDirect finfo
  console.log('Fetching fundamentals in batches from VNDirect...');
  const codes = out.map(r => r.t);
  const LO = 35;
  for (let i = 0; i < codes.length; i += LO) {
    const batch = codes.slice(i, i + LO);
    try {
      const res = await boSungLo(batch);
      out.slice(i, i + LO).forEach(r => {
        const o = res[r.t];
        if (!o) return;
        TRUONG.forEach(k => { if (o[k] != null) r[k] = o[k]; });
      });
    } catch(e) { console.error('Batch error at ' + i + ':', e.message); }
  }

  // RS + CANSLIM + Watchlist grade
  const score = r => (r.r3 != null ? 0.4 * r.r3 : 0) + (r.r6 != null ? 0.3 * r.r6 : 0) + (r.r12 != null ? 0.3 * r.r12 : 0);
  const sorted = out.filter(r => r.p != null && (r.val20 || 0) >= 10000).map(r => ({ t: r.t, s: score(r) })).sort((a, b) => a.s - b.s);
  const rk = {}; sorted.forEach((x, i) => rk[x.t] = Math.max(1, Math.round((i + 1) / sorted.length * 99)));
  for (const r of out) {
    r.rs = rk[r.t] || null;
    if (r.watch) r.wgrade = (r.npatYoY != null && r.npatYoY >= 0 && r.npatYoY < 25) ? 'weak' : 'strong';
    r.cs = {
      C: (r.npatYoY || 0) >= 25 ? 1 : 0,
      A: (r.cagr3 || 0) >= 20 ? 1 : 0,
      N: (r.dHi ?? -99) >= -15 ? 1 : 0,
      S: (r.vx || 0) >= 1.2 ? 1 : 0,
      L: (r.rs || 0) >= 70 ? 1 : 0,
      I: (r.val20 || 0) >= 5000 ? 1 : 0
    };
    r.csTong = Object.values(r.cs).reduce((a, b) => a + b, 0);
  }

  const vn = new Date(Date.now() + 7 * 3600 * 1000);
  const stamp = vn.toISOString().slice(0, 16).replace('T', ' ');
  const SUM2 = { updated: stamp + ' (auto)', coBan: 'vndirect ' + stamp.slice(0, 10), nTickers: out.length, rows: out, tpn: SUM.tpn };
  fs.writeFileSync('dashboard_data.js', 'window.SUMMARY=' + JSON.stringify(SUM2) + ';');
  console.log(`OK: ${out.length} ma, cap nhat ${stamp}`);
})();
