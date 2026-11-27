'use strict';
// 我們的行事曆（Sarah & Ben）— 試用版：資料只存在這支手機（localStorage）
// 之後接雲端同步時，只要換掉 Store 這一段。
const APP_VERSION = '0.15.0';
const NO_END_MINS = 30;                // 沒有結束時間的行程，時間軸上畫 30 分鐘高
const HOUR = 60;                       // 每小時高度（px），要跟 style.css 的 --hour 一致
const NAMES = { ben: '<img class="av" src="icons/boy.svg" alt="">Ben', sarah: '<img class="av" src="icons/girl.svg" alt="">Sarah', both: '♥ 一起', work: '💼 公事' };
const OWNERS = ['ben', 'sarah', 'both', 'work'];
const isShared = o => o === 'both' || o === 'work';   // 橫跨兩欄的行程
const REPEAT = { none: '不重複', daily: '每天', weekly: '每週', monthly: '每月', yearly: '每年', weekdays: '平日（週一到五）' };
const REPEAT_MENU = ['none', 'daily', 'weekly', 'monthly', 'yearly'];   // 選單顯示這幾個（舊的「平日」只在原本有用時出現）
const WEEK = '日一二三四五六';
const WEEK_MON = '一二三四五六日';           // 一週從星期一開始
const monOffset = d => (d.getDay() + 6) % 7;   // 星期一＝0 … 星期日＝6

const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = m => { m = Math.max(0, Math.min(1439, Math.round(m))); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const durLabel = m => m < 60 ? `${m} 分` : (m % 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m / 60} 小時`);

// ---------- 資料（存取） ----------
const Store = {
  KEY: 'our-calendar-v1',
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { return null; } },
  save(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) { toast('存檔失敗'); } }
};
function seed() {
  const t = ymd(new Date());
  const ev = (title, owner, start, end, repeat) => ({ id: uid(), title, owner, date: t, start, end, repeat, ex: [] });
  return {
    events: [
      ev('起床', 'ben', '07:00', '07:30', 'daily'), ev('起床', 'sarah', '07:00', '07:30', 'daily'),
      ev('就寢', 'ben', '23:00', '23:30', 'daily'), ev('就寢', 'sarah', '23:00', '23:30', 'daily'),
      ev('一起吃晚餐', 'both', '18:30', '20:00', 'none')
    ],
    todos: [
      { id: uid(), title: '寄包裹', owner: 'sarah', mins: 30 },
      { id: uid(), title: '修腳踏車', owner: 'ben', mins: 60 },
      { id: uid(), title: '買家具', owner: 'both', mins: 90 }
    ]
  };
}
let db = Store.load();
if (!db) { db = seed(); Store.save(db); }
// v0.6 新增：記帳、庫存、採買清單（舊資料補上欄位）
if (!db.expenses) db.expenses = [];
if (!db.shop) db.shop = [];
if (!db.stock) db.stock = [
  { id: uid(), name: '洗髮精', icon: '🧴', qty: 1, unit: '瓶', low: 1 },
  { id: uid(), name: '衛生紙', icon: '🧻', qty: 6, unit: '捲', low: 4 },
  { id: uid(), name: '雞蛋', icon: '🥚', qty: 10, unit: '顆', low: 4 }
];
Store.save(db);
const save = () => Store.save(db);
let sel = ymd(new Date());

function occursOn(e, day) {
  if (day < e.date || (e.ex || []).includes(day)) return false;
  const dow = parseYmd(day).getDay();
  switch (e.repeat) {
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekly': return dow === parseYmd(e.date).getDay();
    case 'monthly': return day.slice(8) === e.date.slice(8);          // 每月同一號（沒有 31 號的月份就跳過）
    case 'yearly': return day.slice(5) === e.date.slice(5);           // 每年同一天
    default: return day === e.date;
  }
}

// ---------- 畫面 ----------
function render() { renderHeader(); renderEvents(); renderTray(); }

function renderHeader() {
  const d = parseYmd(sel);
  $('#month').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月`;
  const sun = addDays(sel, -monOffset(d)), today = ymd(new Date());
  let h = '';
  for (let i = 0; i < 7; i++) {
    const day = addDays(sun, i);
    h += `<button class="day${day === sel ? ' sel' : ''}${day === today ? ' today' : ''}" data-day="${day}">
      <span class="w">${WEEK_MON[i]}</span><span class="n">${parseYmd(day).getDate()}</span></button>`;
  }
  $('#days').innerHTML = h;
}

function buildHours() {
  let h = '';
  for (let i = 0; i <= 24; i++) h += `<div class="hr" style="top:${i * HOUR}px"><span>${pad(i % 24)}:00</span><span class="r">${pad(i % 24)}:00</span></div>`;
  $('#hours').innerHTML = h;
}

function layoutLanes(items) {
  items.sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [], ends = [], clusterEnd = -1;
  const flush = () => { cluster.forEach(it => it.n = ends.length); cluster = []; ends = []; };
  for (const it of items) {
    if (it.s >= clusterEnd) { flush(); clusterEnd = -1; }
    let i = ends.findIndex(x => x <= it.s);
    if (i < 0) { i = ends.length; ends.push(it.e); } else ends[i] = it.e;
    it.lane = i; cluster.push(it); clusterEnd = Math.max(clusterEnd, it.e);
  }
  flush();
}

function renderEvents() {
  const box = $('#events');
  const items = db.events.filter(e => occursOn(e, sel)).map(e => {
    const s = toMin(e.start), e2 = e.end ? Math.max(toMin(e.end), s + 15) : s + NO_END_MINS;
    return { ev: e, s, e: e2 };
  });
  ['ben', 'sarah'].forEach(o => layoutLanes(items.filter(i => i.ev.owner === o)));
  let h = '';
  for (const it of items) {
    const o = it.ev.owner, top = it.s / 60 * HOUR, ht = Math.max(24, (it.e - it.s) / 60 * HOUR - 2);
    let left, width;
    if (isShared(o)) { left = 0; width = 100; }
    else { const base = o === 'ben' ? 0 : 50; width = 50 / it.n; left = base + it.lane * width; }
    const icon = /起床/.test(it.ev.title) ? '☀︎ ' : /就寢|睡/.test(it.ev.title) ? '☾ ' : o === 'both' ? '♥ ' : o === 'work' ? '💼 ' : '';
    h += `<div class="ev ${o}" data-id="${it.ev.id}" style="top:${top + 1}px;height:${ht}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px)">
      <b>${it.ev.end ? '' : `<span class="st">${it.ev.start}</span> `}${icon}${esc(it.ev.title)}</b>${it.ev.end && ht >= 36 ? `<small>${it.ev.start}–${it.ev.end}${it.ev.repeat !== 'none' ? ' · ↻' + REPEAT[it.ev.repeat] : ''}</small>` : ''}${it.ev.note && ht >= 52 ? `<small class="note">📝 ${esc(it.ev.note)}</small>` : ''}</div>`;
  }
  if (sel === ymd(new Date())) {
    const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    h += `<div class="now" style="top:${m / 60 * HOUR}px"></div>`;
  }
  box.innerHTML = h;
}

function renderTray() {
  $('#tcount').textContent = db.todos.length ? `（${db.todos.length}）` : '';
  $('#chips').innerHTML = db.todos.length
    ? db.todos.map(t => `<div class="chip ${t.owner}" data-id="${t.id}">${esc(t.title)}${t.note ? '<small>📝</small>' : ''}</div>`).join('')
    : '<p class="empty">目前沒有待安排的事，按「＋ 新增」加一個吧</p>';
}

function scrollToNow() {
  const sc = $('#scroller');
  const m = sel === ymd(new Date()) ? new Date().getHours() * 60 - 90 : 6.5 * 60;
  sc.scrollTop = Math.max(0, m / 60 * HOUR);
}

// ---------- 小工具 ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
function openSheet(html) { $('#sheet').innerHTML = html; $('#sheetwrap').hidden = false; }
function closeSheet() { $('#sheetwrap').hidden = true; $('#sheet').innerHTML = ''; }
function segHtml(owner) {
  return `<div class="seg">${OWNERS.map(o =>
    `<button type="button" class="${o}${o === owner ? ' on' : ''}" data-owner="${o}">${NAMES[o]}</button>`).join('')}</div>`;
}
function bindSeg() {
  $('#sheet .seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $('#sheet .seg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
}
const segValue = () => $('#sheet .seg .on').dataset.owner;

// ---------- 新增／編輯行程 ----------
function openEvent(e, preset = {}) {
  const isNew = !e;
  const v = e || { title: '', owner: preset.owner || 'sarah', date: sel, start: preset.start || '09:00',
    end: preset.end || '', repeat: 'none' };
  const rep = v.repeat !== 'none';
  // 結束時間：無／15 分／30 分／1 小時／自選
  const dur = v.end ? toMin(v.end) - toMin(v.start) : 0;
  const endSel = !v.end ? 'none' : [15, 30, 60].includes(dur) ? String(dur) : 'custom';
  const END_OPTS = [['none', '無'], ['15', '15 分鐘'], ['30', '30 分鐘'], ['60', '1 小時'], ['custom', '自選時間']];
  openSheet(`
    <h3>${isNew ? '新增行程' : '編輯行程'}</h3>
    <label>要做什麼？</label><input id="f-title" value="${esc(v.title)}" placeholder="例如：看牙醫">
    <label>是誰的？</label>${segHtml(v.owner)}
    <label>${rep ? '從哪一天開始' : '日期'}</label><input id="f-date" type="date" value="${v.date}">
    <div class="row2">
      <div><label>開始</label><input id="f-start" type="time" step="300" value="${v.start}"></div>
      <div><label>結束</label>
        <select id="f-endsel">${END_OPTS.map(([k, t]) => `<option value="${k}"${k === endSel ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
    </div>
    <div id="f-endbox"${endSel === 'custom' ? '' : ' hidden'}><label>結束時間</label><input id="f-end" type="time" step="300" value="${v.end || toTime(toMin(v.start) + 90)}"></div>
    <label>重複</label>
    <select id="f-repeat">${Object.entries(REPEAT).filter(([k]) => REPEAT_MENU.includes(k) || k === v.repeat).map(([k, t]) => `<option value="${k}"${k === v.repeat ? ' selected' : ''}>${t}</option>`).join('')}</select>
    <label>備註</label><input id="f-note" value="${esc(v.note || '')}" placeholder="例如：記得帶健保卡、地址">
    ${!isNew && rep ? '<p class="hint">這是重複的行程，修改會套用到每一天。</p>' : ''}
    <p class="err" id="f-err"></p>
    <div class="btns" id="f-btns">
      <button class="primary" id="f-save">儲存</button>
      ${isNew ? '' : '<button id="f-back">移回待安排</button><button class="danger" id="f-del">刪除</button>'}
      <button id="f-cancel">取消</button>
    </div>`);
  bindSeg();
  if (isNew) setTimeout(() => $('#f-title').focus(), 50);
  $('#sheet').querySelectorAll('input').forEach(i => i.addEventListener('input', () => $('#f-err').textContent = ''));
  $('#f-endsel').onchange = () => { $('#f-endbox').hidden = $('#f-endsel').value !== 'custom'; $('#f-err').textContent = ''; };
  $('#f-cancel').onclick = closeSheet;
  $('#f-save').onclick = () => {
    const title = $('#f-title').value.trim(), start = $('#f-start').value, date = $('#f-date').value, es = $('#f-endsel').value;
    if (!title) return $('#f-err').textContent = '請先寫要做什麼';
    if (!date || !start) return $('#f-err').textContent = '日期和開始時間都要填';
    let end = '';                                     // 「無」＝只記開始時間
    if (es === 'custom') {
      end = $('#f-end').value;
      if (!end || toMin(end) <= toMin(start)) return $('#f-err').textContent = '結束時間要比開始晚';
    } else if (es !== 'none') {
      const m = toMin(start) + Number(es);
      if (m > 1439) return $('#f-err').textContent = '超過半夜 12 點了，請改用「自選時間」';
      end = toTime(m);
    }
    const data = { title, owner: segValue(), date, start, end, repeat: $('#f-repeat').value, note: $('#f-note').value.trim() };
    if (isNew) db.events.push({ id: uid(), ex: [], ...data }); else Object.assign(e, data);
    save(); closeSheet(); renderEvents(); toast('已儲存');
  };
  if (isNew) return;
  $('#f-back').onclick = () => {
    db.todos.push({ id: uid(), title: e.title, owner: e.owner, mins: 0, note: e.note || '' });
    removeEvent(e, rep ? 'one' : 'all');
    toast('已移回待安排');
  };
  $('#f-del').onclick = () => {
    if (!rep) { removeEvent(e, 'all'); toast('已刪除'); return; }
    $('#f-btns').innerHTML = `<p class="hint">這是重複的行程，要刪除哪些？</p>
      <button class="danger" id="d-one">只刪 ${parseYmd(sel).getMonth() + 1}/${parseYmd(sel).getDate()} 這一天</button>
      <button class="danger" id="d-all">每一天都刪除</button><button id="d-no">取消</button>`;
    $('#d-one').onclick = () => { removeEvent(e, 'one'); toast('已刪除這一天'); };
    $('#d-all').onclick = () => { removeEvent(e, 'all'); toast('已全部刪除'); };
    $('#d-no').onclick = closeSheet;
  };
}
function removeEvent(e, mode) {
  if (mode === 'one') (e.ex = e.ex || []).push(sel);
  else db.events = db.events.filter(x => x !== e);
  save(); closeSheet(); render();
}

// ---------- 新增／編輯待辦 ----------
function openTodo(t) {
  // 待安排只記：要做什麼、是誰的、備註（時間等拖進時間軸再決定）
  const isNew = !t;
  const v = t || { title: '', owner: 'sarah', note: '' };
  openSheet(`
    <h3>${isNew ? '新增待安排' : '編輯待安排'}</h3>
    <label>要做什麼？</label><input id="t-title" value="${esc(v.title)}" placeholder="例如：寄包裹">
    <label>是誰的？</label>${segHtml(v.owner)}
    <label>備註</label><input id="t-note" value="${esc(v.note || '')}" placeholder="例如：郵局 5 點關門">
    <p class="err" id="t-err"></p>
    <div class="btns">
      <button class="primary" id="t-save">儲存</button>
      ${isNew ? '' : '<button class="danger" id="t-del">刪除</button>'}
      <button id="t-cancel">取消</button>
    </div>`);
  bindSeg();
  if (isNew) setTimeout(() => $('#t-title').focus(), 50);
  $('#t-title').addEventListener('input', () => $('#t-err').textContent = '');
  $('#t-cancel').onclick = closeSheet;
  $('#t-save').onclick = () => {
    const title = $('#t-title').value.trim();
    if (!title) return $('#t-err').textContent = '請先寫要做什麼';
    const data = { title, owner: segValue(), note: $('#t-note').value.trim(), mins: 0 };
    if (isNew) db.todos.push({ id: uid(), ...data }); else Object.assign(t, data);
    save(); closeSheet(); renderTray(); toast('已儲存');
  };
  if (!isNew) $('#t-del').onclick = () => { db.todos = db.todos.filter(x => x !== t); save(); closeSheet(); renderTray(); toast('已刪除'); };
}

// ---------- 拖曳待辦到時間軸 ----------
let drag = null;
const PV = document.getElementById('preview');   // 拖曳時的虛線預覽框
function onChipDown(ev) {
  const chip = ev.target.closest('.chip'); if (!chip) return;
  const t = db.todos.find(x => x.id === chip.dataset.id); if (!t) return;
  ev.preventDefault();
  try { chip.setPointerCapture(ev.pointerId); } catch (e) { }
  drag = { t, chip, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, active: false, ghost: null, drop: null, raf: 0 };
}
function onChipMove(ev) {
  if (!drag) return;
  drag.x = ev.clientX; drag.y = ev.clientY;
  if (!drag.active) {
    if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 6) return;
    drag.active = true;
    const g = drag.chip.cloneNode(true); g.classList.add('ghost'); document.body.appendChild(g);
    drag.ghost = g; drag.chip.classList.add('lifted');
    drag.raf = requestAnimationFrame(dragLoop);
  }
  drag.ghost.style.left = drag.x + 'px'; drag.ghost.style.top = drag.y + 'px';
  updateDrop();
}
function dragLoop() {
  if (!drag || !drag.active) return;
  const r = $('#scroller').getBoundingClientRect();
  if (drag.y < r.top + 50 && drag.y > r.top - 40) { $('#scroller').scrollTop -= 8; updateDrop(); }
  else if (drag.y > r.bottom - 50 && drag.y < r.bottom + 10) { $('#scroller').scrollTop += 8; updateDrop(); }
  drag.raf = requestAnimationFrame(dragLoop);
}
function updateDrop() {
  const sc = $('#scroller').getBoundingClientRect(), box = $('#events'), br = box.getBoundingClientRect(), pv = PV;
  const inside = drag.y >= sc.top && drag.y <= sc.bottom && drag.x >= sc.left && drag.x <= sc.right;
  if (!inside) { drag.drop = null; pv.hidden = true; return; }
  const mins = NO_END_MINS;                  // 待安排沒有時間長度，拖進去只定開始時間
  let start = Math.round(((drag.y - br.top) / HOUR * 60 - 15) / 15) * 15;
  start = Math.max(0, Math.min(1440 - mins, start));
  drag.drop = start;
  const o = drag.t.owner, left = o === 'sarah' ? 50 : 0, width = isShared(o) ? 100 : 50;
  if (pv.parentNode !== box) box.appendChild(pv);
  pv.hidden = false;
  pv.className = '';
  pv.style.cssText = `top:${start / 60 * HOUR}px;height:${Math.max(24, mins / 60 * HOUR)}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px);border-color:var(--${o}-bd);color:var(--${o}-fg)`;
  pv.textContent = toTime(start);
}
function onChipUp() {
  if (!drag) return;
  const d = drag; drag = null;
  cancelAnimationFrame(d.raf);
  if (!d.active) { openTodo(d.t); return; }
  d.ghost.remove(); d.chip.classList.remove('lifted');
  PV.hidden = true; document.body.appendChild(PV);
  if (d.drop == null) return;
  db.events.push({ id: uid(), title: d.t.title, owner: d.t.owner, date: sel,
    start: toTime(d.drop), end: '', repeat: 'none', ex: [], note: d.t.note || '' });
  db.todos = db.todos.filter(x => x !== d.t);
  save(); render(); toast(`已排進 ${toTime(d.drop)}`);
}

// ---------- 事件綁定 ----------
function bind() {
  $('#days').addEventListener('click', e => {
    const b = e.target.closest('.day'); if (!b) return;
    sel = b.dataset.day; render(); scrollToNow();
  });
  $('#prev').onclick = () => { sel = addDays(sel, -7); render(); };
  $('#next').onclick = () => { sel = addDays(sel, 7); render(); };
  $('#today').onclick = () => { sel = ymd(new Date()); render(); scrollToNow(); };
  $('#add').onclick = () => openEvent(null);
  $('#addtodo').onclick = () => openTodo(null);
  $('#events').addEventListener('click', e => {
    if (Date.now() < suppressClickUntil) return;
    const evEl = e.target.closest('.ev');
    if (evEl) { const ev = db.events.find(x => x.id === evEl.dataset.id); if (ev) openEvent(ev); return; }
    const r = $('#events').getBoundingClientRect();
    const owner = e.clientX - r.left < r.width / 2 ? 'ben' : 'sarah';
    const s = Math.floor((e.clientY - r.top) / HOUR * 2) * 30;
    openEvent(null, { owner, start: toTime(s) });
  });
  $('#sheetwrap').addEventListener('click', e => { if (e.target.id === 'sheetwrap') closeSheet(); });
  const chips = $('#chips');
  chips.addEventListener('pointerdown', onChipDown);
  chips.addEventListener('pointermove', onChipMove);
  chips.addEventListener('pointerup', onChipUp);
  chips.addEventListener('pointercancel', onChipUp);
  // 每分鐘更新「現在」那條線；回到 App 時也更新
  setInterval(() => { if (!drag && !mv && sel === ymd(new Date())) renderEvents(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderEvents(); });
}

// ---------- 久按行程 → 拖到別的時間 ----------
// 手指按住不動約 0.4 秒，行程會「浮起來」，這時可以上下移動；放開就改到新時間。
// 按住前就開始滑動 → 當作一般捲動，不會移動行程。
let mv = null, suppressClickUntil = 0;
const HOLD_MS = 400;
function evStart(x, y, el) {
  const e = db.events.find(v => v.id === el.dataset.id); if (!e) return;
  mv = { e, el, x0: x, y0: y, y, active: false, raf: 0,
    s0: toMin(e.start), dur: e.end ? Math.max(15, toMin(e.end) - toMin(e.start)) : NO_END_MINS, newStart: null,
    timer: setTimeout(() => liftEvent(), HOLD_MS) };
}
function liftEvent() {
  if (!mv) return;
  mv.active = true; mv.newStart = mv.s0;
  mv.el.classList.add('moving');
  mv.label = document.createElement('div'); mv.label.className = 'move-label'; mv.el.appendChild(mv.label);
  updateMove(); mv.raf = requestAnimationFrame(moveLoop);
}
function evMove(x, y) {
  if (!mv) return false;
  mv.y = y;
  if (!mv.active) {
    if (Math.hypot(x - mv.x0, y - mv.y0) > 8) { clearTimeout(mv.timer); mv = null; }   // 是在捲動
    return false;
  }
  updateMove(); return true;
}
function updateMove() {
  const scTop = $('#scroller').scrollTop;
  if (mv.scroll0 == null) mv.scroll0 = scTop;
  const delta = (mv.y - mv.y0 + (scTop - mv.scroll0)) / HOUR * 60;
  let s = Math.round((mv.s0 + delta) / 15) * 15;
  s = Math.max(0, Math.min(1440 - mv.dur, s));
  mv.newStart = s;
  mv.el.style.top = (s / 60 * HOUR + 1) + 'px';
  mv.label.textContent = mv.e.end ? `${toTime(s)}–${toTime(Math.min(1439, s + mv.dur))}` : toTime(s);
}
function moveLoop() {
  if (!mv || !mv.active) return;
  const r = $('#scroller').getBoundingClientRect(), sc = $('#scroller');
  if (mv.y < r.top + 50) { sc.scrollTop -= 8; updateMove(); }
  else if (mv.y > r.bottom - 50) { sc.scrollTop += 8; updateMove(); }
  mv.raf = requestAnimationFrame(moveLoop);
}
function evEnd() {
  if (!mv) return;
  const m = mv; mv = null;
  clearTimeout(m.timer); cancelAnimationFrame(m.raf);
  if (!m.active) return;                       // 只是點一下 → 交給 click 開編輯
  suppressClickUntil = Date.now() + 400;
  const e = m.e, s = m.newStart, start = toTime(s), end = e.end ? toTime(Math.min(1439, s + m.dur)) : '';
  if (s === m.s0) { renderEvents(); return; }
  if (e.repeat === 'none') {
    e.start = start; e.end = end; save(); renderEvents(); toast(`已改到 ${start}`); return;
  }
  openSheet(`<h3>改時間</h3><p class="hint">「${esc(e.title)}」是重複的行程，要改哪些？</p>
    <div class="btns"><button class="primary" id="m-one">只改 ${parseYmd(sel).getMonth() + 1}/${parseYmd(sel).getDate()} 這一天</button>
    <button id="m-all">每一天都改成 ${start}</button><button id="m-no">取消</button></div>`);
  $('#m-one').onclick = () => {
    (e.ex = e.ex || []).push(sel);
    db.events.push({ id: uid(), title: e.title, owner: e.owner, date: sel, start, end, repeat: 'none', ex: [] });
    save(); closeSheet(); renderEvents(); toast(`已改到 ${start}`);
  };
  $('#m-all').onclick = () => { e.start = start; e.end = end; save(); closeSheet(); renderEvents(); toast('每一天都改好了'); };
  $('#m-no').onclick = () => { closeSheet(); renderEvents(); };
}
function bindMove() {
  const box = $('#events');
  // 手機（觸控）
  box.addEventListener('touchstart', ev => {
    const el = ev.target.closest('.ev'); if (!el || ev.touches.length > 1) return;
    const t = ev.touches[0]; evStart(t.clientX, t.clientY, el);
  }, { passive: true });
  box.addEventListener('touchmove', ev => {
    const t = ev.touches[0];
    if (evMove(t.clientX, t.clientY)) ev.preventDefault();      // 行程浮起來時，不要讓畫面捲動
  }, { passive: false });
  box.addEventListener('touchend', evEnd);
  box.addEventListener('touchcancel', evEnd);
  box.addEventListener('contextmenu', ev => { if (ev.target.closest('.ev')) ev.preventDefault(); });
  // 電腦（滑鼠）
  box.addEventListener('mousedown', ev => { const el = ev.target.closest('.ev'); if (el) evStart(ev.clientX, ev.clientY, el); });
  window.addEventListener('mousemove', ev => { if (mv) evMove(ev.clientX, ev.clientY); });
  window.addEventListener('mouseup', evEnd);
}

// ====================================================================
// 月曆＋經期紀錄
// 經期資料「只存在這支手機」（獨立的 Private），之後接雲端同步也不會上傳。
// ====================================================================
const Private = {
  KEY: 'our-calendar-private-v1',
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { return null; } },
  save(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) { toast('存檔失敗'); } }
};
let pv = Private.load() || { periods: [], logs: {} };
const savePv = () => Private.save(pv);
const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const md = s => `${parseYmd(s).getMonth() + 1}/${parseYmd(s).getDate()}`;
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const FLOW = ['少', '中', '多'];
const PAIN = ['沒有', '輕微', '中等', '嚴重'];
const MOOD = ['😄', '🙂', '😐', '😣', '😢'];
const SYMPTOMS = ['肚子痛', '腰痠', '頭痛', '胸部脹痛', '長痘痘', '疲倦', '脹氣', '情緒起伏'];
const DISCHARGE = ['乾乾的', '黏稠', '乳白色', '蛋白狀（拉絲）', '水水的', '顏色或味道怪怪的'];
const SEX = ['沒有', '有（有避孕）', '有（沒避孕）'];
const POOP = ['沒有大', '正常', '偏硬／便秘', '偏軟', '拉肚子'];

function cycleStats() {
  const starts = pv.periods.map(p => p.start).sort();
  const cyc = [];
  for (let i = 1; i < starts.length; i++) { const d = diffDays(starts[i - 1], starts[i]); if (d >= 15 && d <= 60) cyc.push(d); }
  const c6 = cyc.slice(-6);
  const lens = pv.periods.filter(p => p.end).sort((a, b) => a.start < b.start ? -1 : 1)
    .map(p => diffDays(p.start, p.end) + 1).filter(n => n >= 1 && n <= 14).slice(-6);
  return { starts, avgCycle: c6.length ? Math.round(avg(c6)) : 28, avgLen: lens.length ? Math.round(avg(lens)) : 5,
    hasData: starts.length > 0, enough: c6.length > 0 };
}
function periodEnd(p, st) {           // 還沒按「結束」的經期：先用平均天數顯示，最多 10 天
  if (p.end) return p.end;
  const today = ymd(new Date());
  let e = addDays(p.start, st.avgLen - 1);
  if (today > e) e = today <= addDays(p.start, 9) ? today : addDays(p.start, 9);
  return e;
}
function periodOn(day, st) { return pv.periods.find(p => day >= p.start && day <= periodEnd(p, st)) || null; }
function predictions(st) {
  if (!st.hasData) return [];
  const today = ymd(new Date());
  let s = addDays(st.starts[st.starts.length - 1], st.avgCycle);
  while (addDays(s, st.avgLen - 1) < today) s = addDays(s, st.avgCycle);
  const out = [];
  for (let k = 0; k < 4; k++) { out.push(s); s = addDays(s, st.avgCycle); }
  return out;
}
const predictedOn = (day, preds, st) => preds.some(s => day >= s && day <= addDays(s, st.avgLen - 1));

function renderCycleCard(st, preds) {
  const today = ymd(new Date()), card = $('#cycle-card');
  if (!st.hasData) { card.innerHTML = '<b>還沒有經期紀錄</b><p>點經期開始的那一天，按「經期這天開始」，之後就會幫你預測下一次。</p>'; return; }
  const cur = periodOn(today, st);
  const meta = `<p>平均週期 ${st.avgCycle} 天・經期約 ${st.avgLen} 天${st.enough ? '' : '（記錄兩次以上，預測會更準）'}</p>`;
  if (cur) { card.innerHTML = `<b>經期第 ${diffDays(cur.start, today) + 1} 天</b>${meta}`; return; }
  const expected = addDays(st.starts[st.starts.length - 1], st.avgCycle);
  if (expected < today) {
    card.innerHTML = `<b>比預測晚了 ${diffDays(expected, today)} 天</b><p>原本預計 ${md(expected)} 開始；來了記得點那天記錄。</p>${meta}`;
    return;
  }
  const n = diffDays(today, preds[0]);
  card.innerHTML = `<b>下次預計 ${md(preds[0])} 開始</b><p>${n === 0 ? '就是今天' : `還有 ${n} 天`}</p>${meta}`;
}

let mCur = ymd(new Date()).slice(0, 7);
let mMode = (() => { try { return localStorage.getItem('our-calendar-mmode') || 'events'; } catch (e) { return 'events'; } })();   // events＝只看行程、period＝只看經期
function renderMonth() {
  const [y, m] = mCur.split('-').map(Number);
  $('#m-title').textContent = `${y}年${m}月`;
  const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate();
  const start = addDays(ymd(first), -monOffset(first)), cells = Math.ceil((monOffset(first) + daysIn) / 7) * 7;
  const st = cycleStats(), preds = predictions(st), today = ymd(new Date()), evMode = mMode === 'events';
  document.querySelectorAll('.mtabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === mMode));
  $('#cycle-card').hidden = evMode;
  $('#mgrid').classList.toggle('evmode', evMode);
  $('#legend').innerHTML = evMode
    ? '<span><i class="dot ben"></i>Ben</span><span><i class="dot sarah"></i>Sarah</span><span><i class="dot both"></i>一起</span><span><i class="dot work"></i>公事</span>'
    : '<span><i class="lg period"></i>經期</span><span><i class="lg predict"></i>預測</span><span>💧量</span><span>🤕症狀</span><span>🫧分泌物</span><span>💩大便</span><span>❤️親密</span><span>📝備註</span>';
  $('#m-hint').textContent = evMode
    ? '左右滑可以換月份。點一下日期看那天的行程；每天、平日重複的行程（例如起床）不會顯示在月曆上。'
    : '左右滑可以換月份。點一下日期記錄經期和身體狀況；這些紀錄只存在這支手機，不會給別人看到。';
  if (!evMode) renderCycleCard(st, preds);
  let h = '';
  for (let i = 0; i < cells; i++) {
    const day = addDays(start, i);
    const cls = ['mday'];
    if (day.slice(0, 7) !== mCur) cls.push('out');
    if (day === today) cls.push('today');
    let inner = '';
    if (evMode) {
      const evs = db.events.filter(e => e.repeat !== 'daily' && e.repeat !== 'weekdays' && occursOn(e, day))
        .sort((a, b) => a.start < b.start ? -1 : 1);
      inner = evs.slice(0, 3).map(e => `<span class="mini ${e.owner}">${esc(e.title)}</span>`).join('')
        + (evs.length > 3 ? `<span class="more">+${evs.length - 3}</span>` : '');
    } else {
      const pd = periodOn(day, st);
      if (pd && (pd.end || day <= today)) cls.push('period');            // 還沒結束的經期，未來的日子用「預測」樣式
      else if (pd || predictedOn(day, preds, st)) cls.push('predict');
      if (pv.logs[day]) inner = logIcons(pv.logs[day]);
    }
    h += `<button class="${cls.join(' ')}" data-day="${day}"><span class="num">${parseYmd(day).getDate()}</span>${inner}</button>`;
  }
  $('#mgrid').innerHTML = h;
}

function startPeriod(day, st) {
  pv.periods.filter(x => !x.end && x.start < day).forEach(x => {   // 上一次忘了按結束 → 自動補上
    const e1 = addDays(x.start, st.avgLen - 1), e2 = addDays(day, -1); x.end = e1 < e2 ? e1 : e2;
  });
  pv.periods.push({ start: day, end: null });
  savePv(); renderMonth(); openDay(day, true); toast('已記錄經期開始');
}
function logIcons(l) {                        // 月曆日期下面的小圖示：有記錄哪些狀況
  const ic = [];
  if (l.mood != null) ic.push(MOOD[l.mood]);
  if (l.flow != null) ic.push('💧');
  if (l.pain > 0 || (l.sym && l.sym.length)) ic.push('🤕');
  if (l.dis != null) ic.push('🫧');
  if (l.poop != null) ic.push('💩');
  if (l.sex > 0) ic.push('❤️');
  if (l.note) ic.push('📝');
  return ic.length ? `<span class="licons">${ic.slice(0, 4).join('')}${ic.length > 4 ? '…' : ''}</span>` : '';
}
function openDay(day, edit = false) {
  const st = cycleStats(), today = ymd(new Date()), p = periodOn(day, st);
  const evs = db.events.filter(e => occursOn(e, day)).sort((a, b) => a.start < b.start ? -1 : 1);
  const d = parseYmd(day);
  let html = `<h3>${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）</h3>`;
  if (mMode === 'events') {
    html += `<div class="evlist">${evs.length ? evs.map(e => `<button class="evrow ${e.owner}" data-goto="1">
      <span>${e.start}${e.end ? '–' + e.end : ''}</span>${esc(e.title)}${e.note ? `<em class="evnote">📝 ${esc(e.note)}</em>` : ''}</button>`).join('') : '<p class="hint">這天沒有行程</p>'}</div>
      <div class="btns"><button class="primary" id="d-add">在這天新增行程</button><button id="d-goto">打開這天的時間軸</button><button id="p-close">關閉</button></div>`;
    openSheet(html);
    $('#sheet').querySelectorAll('[data-goto]').forEach(b => b.onclick = () => goDay(day));
    $('#d-goto').onclick = () => goDay(day);
    $('#d-add').onclick = () => { goDay(day); openEvent(null); };
    $('#p-close').onclick = closeSheet;
    return;
  }
  const log = pv.logs[day] || {};
  const opt = (key, arr, cls = '') => `<div class="opts ${cls}">${arr.map((t, i) => `<button class="${log[key] === i ? 'on' : ''}" data-k="${key}" data-i="${i}">${t}</button>`).join('')}</div>`;
  const multi = (key, arr) => `<div class="opts wrap">${arr.map((t, i) => `<button class="${(log[key] || []).includes(i) ? 'on' : ''}" data-m="${key}" data-i="${i}">${t}</button>`).join('')}</div>`;
  const body = `<label>症狀（可以選很多個）</label>${multi('sym', SYMPTOMS)}
      <label>分泌物</label>${opt('dis', DISCHARGE, 'wrap')}
      <label>大便</label>${opt('poop', POOP, 'wrap')}
      <label>性行為</label>${opt('sex', SEX, 'wrap')}
      <label>心情</label>${opt('mood', MOOD)}
      <label>備註</label><input id="p-note" value="${esc(log.note || '')}" placeholder="例如：想吃甜的、睡不好">`;
  // 以前的日子：先只顯示那天有選的項目，按「修改紀錄」才出現全部選項
  if (day < today && !edit) {
    const rows = [];
    if (log.flow != null) rows.push(['量', FLOW[log.flow]]);
    if (log.pain != null) rows.push(['經痛', PAIN[log.pain]]);
    if (log.sym && log.sym.length) rows.push(['症狀', log.sym.map(i => SYMPTOMS[i]).join('、')]);
    if (log.dis != null) rows.push(['分泌物', DISCHARGE[log.dis]]);
    if (log.poop != null) rows.push(['大便', POOP[log.poop]]);
    if (log.sex != null) rows.push(['性行為', SEX[log.sex]]);
    if (log.mood != null) rows.push(['心情', MOOD[log.mood]]);
    if (log.note) rows.push(['備註', esc(log.note)]);
    html += (p ? `<p class="period-tag">經期第 ${diffDays(p.start, day) + 1} 天</p>` : '')
      + (rows.length ? `<div class="summary">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`
        : '<p class="hint">這天沒有記錄身體狀況。</p>')
      + `<div class="btns"><button class="primary" id="p-edit">${rows.length ? '修改紀錄' : '新增紀錄'}</button>
        ${p ? '' : '<button id="p-start">經期這天開始</button>'}<button id="p-close">關閉</button></div>`;
    openSheet(html);
    $('#p-edit').onclick = () => openDay(day, true);
    $('#p-close').onclick = () => { closeSheet(); renderMonth(); };
    if ($('#p-start')) $('#p-start').onclick = () => startPeriod(day, st);
    return;
  }
  if (p) {
    html += `<p class="period-tag">經期第 ${diffDays(p.start, day) + 1} 天${p.end ? '' : '（還沒按結束）'}</p>
      <label>量</label>${opt('flow', FLOW)}
      <label>經痛</label>${opt('pain', PAIN)}
      ${body}
      <div class="btns">
        ${p.end === day ? '' : '<button id="p-end">經期在這天結束</button>'}
        <button class="danger" id="p-del">刪除這次經期紀錄</button>
        <button id="p-close">完成</button>
      </div>`;
  } else if (day > today) {
    html += `<p class="hint">還沒到的日子不能記錄經期。</p><div class="btns"><button id="p-close">關閉</button></div>`;
  } else {
    html += `<div class="btns"><button class="primary" id="p-start">經期這天開始</button></div>
      <p class="hint">不是經期的日子，也可以記錄身體狀況：</p>${body}
      <div class="btns"><button id="p-close">完成</button></div>`;
  }
  openSheet(html);
  $('#p-close').onclick = () => { if ($('#p-note')) $('#p-note').onchange(); closeSheet(); renderMonth(); };
  if ($('#p-start')) $('#p-start').onclick = () => startPeriod(day, st);
  if (day > today) return;
  $('#sheet').querySelectorAll('.opts button').forEach(b => b.onclick = () => {
    const log = pv.logs[day] = pv.logs[day] || {}, i = Number(b.dataset.i);
    if (b.dataset.m) {                                   // 可以複選（症狀）
      const k = b.dataset.m, arr = log[k] = log[k] || [];
      const at = arr.indexOf(i); if (at >= 0) arr.splice(at, 1); else arr.push(i);
      if (!arr.length) delete log[k];
      b.classList.toggle('on', at < 0);
    } else {                                             // 單選（再按一次取消）
      const k = b.dataset.k;
      if (log[k] === i) delete log[k]; else log[k] = i;
      b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b && log[k] === i));
    }
    if (!Object.keys(log).length) delete pv.logs[day];
    savePv();
  });
  $('#p-note').onchange = () => {
    const v = $('#p-note').value.trim(), log = pv.logs[day] = pv.logs[day] || {};
    if (v) log.note = v; else delete log.note;
    if (!Object.keys(log).length) delete pv.logs[day];
    savePv();
  };
  if (!p) return;
  if ($('#p-end')) $('#p-end').onclick = () => { p.end = day; savePv(); renderMonth(); openDay(day, true); toast('已記錄經期結束'); };
  $('#p-del').onclick = () => {
    $('#p-del').outerHTML = '<button class="danger" id="p-del2">確定刪除（不能復原）</button>';
    $('#p-del2').onclick = () => {
      const end = periodEnd(p, st);
      Object.keys(pv.logs).forEach(k => { if (k >= p.start && k <= end) {      // 只刪經期的量和經痛，其他症狀留著
        delete pv.logs[k].flow; delete pv.logs[k].pain; if (!Object.keys(pv.logs[k]).length) delete pv.logs[k]; } });
      pv.periods = pv.periods.filter(x => x !== p); savePv(); closeSheet(); renderMonth(); toast('已刪除');
    };
  };
}

// ---------- 切換頁面 ----------
function showPage(name) {
  ['day', 'month', 'money', 'stock'].forEach(n => $('#page-' + n).hidden = n !== name);
  document.body.className = 'th-' + name;                      // 每個分頁不同顏色
  const tc = { day: '#E2EEFA', month: '#FBE3EA', money: '#E4EEE4', stock: '#ECE6F7' }[name];
  document.querySelector('meta[name=theme-color]').setAttribute('content', tc);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.page === name));
  if (name === 'month') { mCur = sel.slice(0, 7); renderMonth(); }
  else if (name === 'money') renderMoney();
  else if (name === 'stock') renderStock();
  else render();
}
function goDay(day) { sel = day; closeSheet(); showPage('day'); scrollToNow(); }
function slideMonth(n) {
  const g = $('#mgrid'); g.classList.remove('slide-l', 'slide-r'); void g.offsetWidth;
  shiftMonth(n); g.classList.add(n > 0 ? 'slide-l' : 'slide-r');
}
const shiftMonth = n => { const [y, m] = mCur.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); mCur = ymd(d).slice(0, 7); renderMonth(); };
function bindMonth() {
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showPage(b.dataset.page));
  // 左右滑換月
  let sx = null, sy = 0;
  const ms = $('#page-month .mscroll');
  ms.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  ms.addEventListener('touchend', e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) slideMonth(dx < 0 ? 1 : -1);
  });
  $('#m-today').onclick = () => { mCur = ymd(new Date()).slice(0, 7); renderMonth(); };
  $('#mgrid').addEventListener('click', e => { const b = e.target.closest('.mday'); if (b) openDay(b.dataset.day); });
  document.querySelectorAll('.mtabs button').forEach(b => b.onclick = () => {
    mMode = b.dataset.mode; try { localStorage.setItem('our-calendar-mmode', mMode); } catch (e) { }
    renderMonth();
  });
}

// ====================================================================
// 記帳（兩人共用；之後接同步時跟行程一起上傳）
//  db.accounts：帳戶（信用卡／銀行／現金），餘額＝起始金額＋所有交易加減
//  db.expenses：每一筆交易 { type: expense|income|transfer, amount, cat, acct, toAcct, payer, date, note }
//               （舊資料沒有 type ＝ 支出、沒有 acct ＝ 不指定帳戶）
// ====================================================================
const CATS = [['food', '🍜', '餐飲'], ['grocery', '🛒', '買菜'], ['transport', '🚗', '交通'], ['home', '🏠', '居家'],
  ['shopping', '🛍️', '購物'], ['fun', '🎉', '娛樂'], ['health', '💊', '醫療'], ['bills', '🧾', '帳單'], ['other', '📦', '其他']];
const INCATS = [['salary', '💼', '薪水'], ['bonus', '🎁', '獎金'], ['refund', '↩️', '退款'], ['interest', '🏦', '利息'],
  ['side', '💡', '副業'], ['other_in', '💰', '其他收入']];
const CAT = Object.fromEntries([...CATS, ...INCATS].map(([k, i, n]) => [k, { icon: i, name: n }]));
CAT.transfer = { icon: '⇄', name: '轉帳' };
CAT.adjust = { icon: '⚖️', name: '餘額校正' };
// 自訂分類（例如從 DuoPurse 匯入的「外食」「人情」），存在 db.cats
function allCats(kind) {
  return (kind === 'income' ? INCATS : CATS).concat((db.cats || []).filter(c => c.kind === kind).map(c => [c.k, c.icon, c.name]));
}
function catInfo(k) {
  if (CAT[k]) return CAT[k];
  const c = (db.cats || []).find(z => z.k === k);
  return c ? { icon: c.icon, name: c.name } : { icon: '🏷️', name: '其他' };
}
const PAYER = { ben: 'Ben 付', sarah: 'Sarah 付', both: '一起付' };
const ACCT_TYPES = [['credit', '💳', '信用卡'], ['bank', '🏦', '銀行'], ['cash', '💵', '現金']];
const ACCT_T = Object.fromEntries(ACCT_TYPES.map(([k, i, n]) => [k, { icon: i, name: n }]));
const CHART_COLORS = ['#7FAEE0', '#EE8E6B', '#9B86D9', '#E8B44C', '#5DBB8E', '#EE7F9C', '#6C8EAD', '#C9A227', '#A3A3A3', '#B5838D'];
if (!db.accounts) { db.accounts = []; save(); }
const money = n => (n < 0 ? '-' : '') + 'A$' + Math.abs(Math.round(n * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const txType = x => x.type || 'expense';
let moneyMonth = ymd(new Date()).slice(0, 7);
let moneyTab = 'acct', statKind = 'expense', statBy = 'cat';

function acctBalance(a) {                      // 帳戶餘額：起始金額＋收入－支出±轉帳
  let b = a.init || 0;
  const today = ymd(new Date());
  for (const x of db.expenses) {
    if (x.date > today) continue;                // 未來日期的（預先排好的扣款）還不算進餘額
    const t = txType(x);
    if (t === 'adjust' && x.acct === a.id) { b += x.amount; continue; }   // 餘額校正：金額有正有負
    if (t === 'income' && x.acct === a.id) b += x.amount;
    else if (t === 'expense' && x.acct === a.id) b -= x.amount;
    else if (t === 'transfer') { if (x.acct === a.id) b -= x.amount; if (x.toAcct === a.id) b += x.amount; }
  }
  return Math.round(b * 100) / 100;
}
const acctName = id => { const a = db.accounts.find(z => z.id === id); return a ? a.name : ''; };

function renderMoney() {
  const [y, m] = moneyMonth.split('-').map(Number);
  $('#money-title').textContent = `${y}年${m}月`;
  document.querySelectorAll('.mntabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === moneyTab));
  ['list', 'stat', 'acct'].forEach(t => $('#money-' + t).hidden = t !== moneyTab);
  $('#money-monthnav').style.visibility = moneyTab === 'acct' ? 'hidden' : 'visible';
  const list = db.expenses.filter(x => x.date.slice(0, 7) === moneyMonth)
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.t || 0) - (a.t || 0));
  const out = list.filter(x => txType(x) === 'expense').reduce((s, x) => s + x.amount, 0);
  const inc = list.filter(x => txType(x) === 'income').reduce((s, x) => s + x.amount, 0);
  const sum = `<div class="mgrid2"><div><span>支出</span><b class="neg">${money(out)}</b></div><div><span>收入</span><b class="pos">${money(inc)}</b></div></div>
    <div class="mbal"><span>結餘</span><b class="${inc - out >= 0 ? 'pos' : 'neg'}">${inc - out >= 0 ? '+' : ''}${money(inc - out)}</b></div>`;
  if (moneyTab === 'list') {
    let h = '', last = '';
    for (const x of list) {
      if (x.date !== last) { last = x.date; const d = parseYmd(x.date); h += `<div class="mday-h">${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）</div>`; }
      const t = txType(x), c = t === 'transfer' ? CAT.transfer : t === 'adjust' ? CAT.adjust : catInfo(x.cat);
      const sub = t === 'transfer' ? `${esc(acctName(x.acct) || '?')} → ${esc(acctName(x.toAcct) || '?')}`
        : [acctName(x.acct), x.note && x.merchant ? x.merchant : '', x.payer && t === 'expense' ? PAYER[x.payer] : ''].filter(Boolean).map(esc).join('・');
      h += `<button class="xrow${t === 'adjust' ? ' adj' : ''}${x.date > ymd(new Date()) ? ' future' : ''}" data-id="${x.id}"><span class="ci">${c.icon}</span>
        <span class="xt">${esc(x.note || x.merchant || c.name)}${sub ? `<small>${sub}</small>` : ''}</span>
        <b class="${t === 'income' ? 'pos' : t === 'expense' ? 'neg' : ''}">${t === 'income' ? '+' : t === 'expense' ? '-' : t === 'adjust' ? (x.amount >= 0 ? '+' : '-') : ''}${money(x.amount).replace('-', '')}</b></button>`;
    }
    $('#money-list').innerHTML = `<div class="card">${sum}</div>` + (h || '<p class="empty">這個月還沒有記帳，按右上角「＋」記第一筆吧</p>');
  } else if (moneyTab === 'stat') {
    document.querySelectorAll('.st-kind button').forEach(b => b.classList.toggle('on', b.dataset.k === statKind));
    document.querySelectorAll('.st-by button').forEach(b => b.classList.toggle('on', b.dataset.b === statBy));
    const rows = list.filter(x => txType(x) === statKind);
    const total = rows.reduce((s, x) => s + x.amount, 0);
    const groups = {};
    rows.forEach(x => {
      const k = statBy === 'cat' ? (x.cat || 'other') : (x.acct || '_none');
      (groups[k] = groups[k] || { sum: 0, n: 0 }); groups[k].sum += x.amount; groups[k].n++;
    });
    const arr = Object.entries(groups).sort((a, b) => b[1].sum - a[1].sum);
    // 甜甜圈圖
    let off = 0, ring = '';
    const C = 2 * Math.PI * 70;
    arr.forEach(([k, g], i) => {
      const len = total ? g.sum / total * C : 0;
      ring += `<circle r="70" cx="90" cy="90" fill="none" stroke="${CHART_COLORS[i % CHART_COLORS.length]}" stroke-width="26"
        stroke-dasharray="${Math.max(0, len - 1.5)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`;
      off += len;
    });
    const label = k => statBy === 'cat' ? `${catInfo(k).icon} ${esc(catInfo(k).name)}`
      : (k === '_none' ? '未指定帳戶' : (ACCT_T[(db.accounts.find(a => a.id === k) || {}).type] || { icon: '' }).icon + ' ' + esc(acctName(k) || '（已刪除的帳戶）'));
    $('#money-stat-body').innerHTML = `<div class="card">${sum}</div>` + (arr.length ? `
      <div class="card donut"><svg viewBox="0 0 180 180" width="190" height="190"><circle r="70" cx="90" cy="90" fill="none" stroke="var(--line2)" stroke-width="26"/>${ring}</svg>
        <div class="dc"><span>${statKind === 'expense' ? '支出' : '收入'}</span><b>${money(total)}</b></div></div>
      ${arr.map(([k, g], i) => `<div class="srank"><span class="sl">${label(k)}</span><b>${money(g.sum)}</b>
        <div class="bar"><i style="width:${total ? g.sum / total * 100 : 0}%;background:${CHART_COLORS[i % CHART_COLORS.length]}"></i></div>
        <small>${g.n} 筆</small><small class="r">${total ? Math.round(g.sum / total * 100) : 0}%</small></div>`).join('')}`
      : `<p class="empty">這個月沒有${statKind === 'expense' ? '支出' : '收入'}紀錄</p>`);
  } else {
    const net = db.accounts.reduce((s, a) => s + acctBalance(a), 0);
    let h = `<div class="card"><div class="mbal" style="border:0;margin:0;padding:0"><span>淨資產（所有帳戶加總）</span><b class="${net >= 0 ? 'pos' : 'neg'}">${money(net)}</b></div></div>`;
    for (const [k, icon, name] of ACCT_TYPES) {
      const as = db.accounts.filter(a => a.type === k);
      if (!as.length) continue;
      const sub = as.reduce((s, a) => s + acctBalance(a), 0);
      h += `<div class="sec acc-sec"><span>${icon} ${name}</span><span>${money(sub)}</span></div>` +
        as.map(a => { const b = acctBalance(a); return `<button class="arow" data-id="${a.id}"><span class="xt">${esc(a.name)}${a.last4 ? `<small>${name}（${esc(a.last4)}）</small>` : `<small>${name}</small>`}</span>
          <b class="${b < 0 ? 'neg' : ''}">${money(b)}</b></button>`; }).join('');
    }
    if (!db.accounts.length) h += '<p class="empty">還沒有帳戶。按下面「＋ 新增帳戶」，把信用卡、銀行、現金加進來，輸入現在的餘額就好。</p>';
    h += '<div class="btns"><button class="primary" id="acct-add">＋ 新增帳戶</button><button id="csv-btn">從 DuoPurse 匯入（CSV 檔）</button></div><p class="tray-hint">卡號只要記末四碼就好，不要輸入完整卡號或密碼。</p>';
    $('#money-acct').innerHTML = renderIsland(net) + h;
    $('#acct-add').onclick = () => openAccount(null);
    $('#csv-btn').onclick = () => $('#csv-file').click();
  }
}

function acctOptions(sel, allowNone) {
  return (allowNone ? `<option value="">（不指定）</option>` : '') +
    ACCT_TYPES.map(([k, , n]) => { const as = db.accounts.filter(a => a.type === k); return as.length ? `<optgroup label="${n}">${as.map(a =>
      `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</optgroup>` : ''; }).join('');
}

function openExpense(x) {
  const isNew = !x;
  const v = x || { type: 'expense', amount: '', cat: 'food', payer: '', date: ymd(new Date()), note: '', acct: (db.accounts[0] || {}).id || '' };
  let type = txType(v);
  const catGrid = (list, cur) => list.map(([k, i, n]) => `<button type="button" data-cat="${k}" class="${k === cur ? 'on' : ''}">${i}<span>${n}</span></button>`).join('');
  openSheet(`
    <h3>${isNew ? '記一筆' : '修改這筆'}</h3>
    <div class="seg seg3 ttype">${[['expense', '支出'], ['income', '收入'], ['transfer', '轉帳']].map(([k, n]) =>
      `<button type="button" data-t="${k}" class="${k === type ? 'on' : ''}">${n}</button>`).join('')}</div>
    <label>多少錢？</label><input id="x-amt" type="number" inputmode="decimal" step="0.01" min="0" value="${v.amount}" placeholder="0.00" class="big">
    <div id="x-catbox"><label>類別</label><div class="catgrid" id="x-cats"></div></div>
    <label id="x-acct-l">${type === 'income' ? '存進哪個帳戶' : type === 'transfer' ? '從哪個帳戶轉出' : '用哪個帳戶付'}</label>
    <select id="x-acct">${acctOptions(v.acct, true)}</select>
    <div id="x-tobox"><label>轉進哪個帳戶</label><select id="x-to">${acctOptions(v.toAcct, true)}</select>
      <p class="hint">例如：用銀行帳戶繳信用卡費，就是「銀行 → 信用卡」。</p></div>
    <div id="x-payerbox"><label>誰付的？<span class="opt-tag">可不選</span></label>
      <div class="seg seg3" id="x-payer">${['ben', 'sarah', 'both'].map(o => `<button type="button" class="${o}${o === v.payer ? ' on' : ''}" data-owner="${o}">${NAMES[o]}</button>`).join('')}</div></div>
    <label>日期</label><input id="x-date" type="date" value="${v.date}">
    <label>備註（可以不填）</label><input id="x-note" value="${esc(v.note || '')}" placeholder="例如：Woolworths、和朋友吃飯">
    ${db.accounts.length ? '' : '<p class="hint">還沒有帳戶的話，先到記帳的「帳戶」分頁新增，餘額才會自動加減。</p>'}
    <p class="err" id="x-err"></p>
    <div class="btns"><button class="primary" id="x-save">儲存</button>
      ${isNew ? '' : '<button class="danger" id="x-del">刪除</button>'}<button id="x-cancel">取消</button></div>`);
  let cat = v.cat;
  const paint = () => {
    document.querySelectorAll('.ttype button').forEach(b => b.classList.toggle('on', b.dataset.t === type));
    $('#x-catbox').hidden = type === 'transfer';
    $('#x-tobox').hidden = type !== 'transfer';
    $('#x-payerbox').hidden = type !== 'expense';
    $('#x-acct-l').textContent = type === 'income' ? '存進哪個帳戶' : type === 'transfer' ? '從哪個帳戶轉出' : '用哪個帳戶付';
    const list = allCats(type);
    if (!list.some(([k]) => k === cat)) cat = list[0][0];
    $('#x-cats').innerHTML = catGrid(list, cat);
  };
  paint();
  if (isNew) setTimeout(() => $('#x-amt').focus(), 50);
  $('#sheet .ttype').onclick = e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t; paint(); };
  $('#x-cats').onclick = e => { const b = e.target.closest('button'); if (!b) return; cat = b.dataset.cat; paint(); };
  $('#x-payer').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    const on = !b.classList.contains('on'); $('#x-payer').querySelectorAll('button').forEach(z => z.classList.remove('on')); if (on) b.classList.add('on'); };
  $('#x-amt').oninput = () => $('#x-err').textContent = '';
  $('#x-cancel').onclick = closeSheet;
  $('#x-save').onclick = () => {
    const amount = Math.round(parseFloat($('#x-amt').value) * 100) / 100;
    if (!(amount > 0)) return $('#x-err').textContent = '請輸入金額';
    if (!$('#x-date').value) return $('#x-err').textContent = '請選日期';
    const acct = $('#x-acct').value, toAcct = $('#x-to').value;
    if (type === 'transfer' && (!acct || !toAcct)) return $('#x-err').textContent = '轉帳要選轉出和轉進的帳戶';
    if (type === 'transfer' && acct === toAcct) return $('#x-err').textContent = '轉出和轉進不能是同一個帳戶';
    const pb = $('#x-payer .on');
    const data = { type, amount, cat: type === 'transfer' ? 'transfer' : cat, acct, toAcct: type === 'transfer' ? toAcct : '',
      payer: type === 'expense' && pb ? pb.dataset.owner : '', date: $('#x-date').value, note: $('#x-note').value.trim() };
    if (isNew) db.expenses.push({ id: uid(), t: Date.now(), ...data }); else Object.assign(x, data);
    save(); closeSheet(); moneyMonth = data.date.slice(0, 7); renderMoney(); toast('記好了');
  };
  if (!isNew) $('#x-del').onclick = () => {
    $('#x-del').outerHTML = '<button class="danger" id="x-del2">確定刪除</button>';
    $('#x-del2').onclick = () => { db.expenses = db.expenses.filter(z => z !== x); save(); closeSheet(); renderMoney(); toast('已刪除'); };
  };
}

function openAccount(a) {
  const isNew = !a;
  const v = a || { name: '', type: 'bank', last4: '' };
  const bal = a ? acctBalance(a) : '';
  openSheet(`
    <h3>${isNew ? '新增帳戶' : '修改帳戶'}</h3>
    <label>帳戶名稱</label><input id="a-name" value="${esc(v.name)}" placeholder="例如：NAB 信用卡、Ubank、現金">
    <label>種類</label>
    <div class="seg seg3" id="a-type">${ACCT_TYPES.map(([k, i, n]) => `<button type="button" data-k="${k}" class="${k === v.type ? 'on' : ''}">${i} ${n}</button>`).join('')}</div>
    <label>卡號或帳號末四碼 <span class="opt-tag">可不填</span></label><input id="a-last4" inputmode="numeric" maxlength="4" value="${esc(v.last4 || '')}" placeholder="1234">
    <label id="a-bal-l">${v.type === 'credit' ? '現在欠多少（未繳的卡費）' : '現在有多少錢'}</label>
    <input id="a-bal" type="number" inputmode="decimal" step="0.01" value="${a ? Math.abs(v.type === 'credit' ? Math.min(0, bal) : bal) : ''}" placeholder="0.00">
    <p class="hint" id="a-hint">${isNew ? '輸入現在的金額就好，之後每記一筆會自動加減。' : '如果跟銀行對不起來，直接改成正確金額，App 會自動校正。'}</p>
    <p class="err" id="a-err"></p>
    <div class="btns"><button class="primary" id="a-save">儲存</button>
      ${isNew ? '' : '<button class="danger" id="a-del">刪除帳戶</button>'}<button id="a-cancel">取消</button></div>`);
  let type = v.type;
  $('#a-type').onclick = e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.k;
    $('#a-type').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b));
    $('#a-bal-l').textContent = type === 'credit' ? '現在欠多少（未繳的卡費）' : '現在有多少錢'; };
  $('#a-last4').oninput = () => { $('#a-last4').value = $('#a-last4').value.replace(/\D/g, '').slice(0, 4); };
  $('#a-cancel').onclick = closeSheet;
  $('#a-save').onclick = () => {
    const name = $('#a-name').value.trim();
    if (!name) return $('#a-err').textContent = '請寫帳戶名稱';
    let want = parseFloat($('#a-bal').value) || 0;
    if (type === 'credit') want = -Math.abs(want);             // 信用卡：欠款記成負數
    const acc = a || { id: uid(), init: 0 };
    Object.assign(acc, { name, type, last4: $('#a-last4').value });
    if (!a) db.accounts.push(acc);
    acc.init = 0; acc.init = Math.round((want - acctBalance(acc)) * 100) / 100;   // 讓「現在餘額」剛好等於輸入的金額
    save(); closeSheet(); renderMoney(); toast('已儲存');
  };
  if (!isNew) $('#a-del').onclick = () => {
    const n = db.expenses.filter(x => x.acct === a.id || x.toAcct === a.id).length;
    $('#a-del').outerHTML = `<button class="danger" id="a-del2">確定刪除${n ? `（${n} 筆紀錄會變成「未指定帳戶」）` : ''}</button>`;
    $('#a-del2').onclick = () => {
      db.expenses.forEach(x => { if (x.acct === a.id) x.acct = ''; if (x.toAcct === a.id) x.toAcct = ''; });
      db.accounts = db.accounts.filter(z => z !== a); save(); closeSheet(); renderMoney(); toast('已刪除');
    };
  };
}

// ---------- 餘額校正（匯入時用來對齊帳戶餘額；不算進收支統計） ----------
function openAdjust(x) {
  openSheet(`<h3>⚖️ 餘額校正</h3>
    <p class="hint">這筆是用來把「${esc(acctName(x.acct) || '帳戶')}」的餘額對齊用的，不算支出也不算收入，統計裡不會出現。</p>
    <div class="summary"><div><span>金額</span><b>${x.amount >= 0 ? '+' : ''}${money(x.amount)}</b></div><div><span>日期</span><b>${x.date}</b></div></div>
    <div class="btns"><button class="danger" id="j-del">刪除這筆</button><button id="j-close">關閉</button></div>`);
  $('#j-close').onclick = closeSheet;
  $('#j-del').onclick = () => { db.expenses = db.expenses.filter(z => z !== x); save(); closeSheet(); renderMoney(); toast('已刪除'); };
}

// ---------- 從 DuoPurse 匯入 CSV ----------
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
const CAT_MAP = { '交通': 'transport', '其他': 'other', '買菜': 'grocery', '購物': 'shopping', '娛樂': 'fun', '帳單': 'bills' };
const INCAT_MAP = { '薪資': 'salary', '薪水': 'salary', '獎金': 'bonus', '退款': 'refund', '利息': 'interest', '其他': 'other_in' };
const CAT_ICON = { '外食': '🍜', '家用': '🏠', '工作': '💼', '人情': '🎁', '台灣副卡': '💳', '醫療/保險/健身房': '💊', '接案': '💡' };
function guessAcctType(name) { return /現金|cash/i.test(name) ? 'cash' : /結算|繳費|信用卡|卡|visa|master|amex/i.test(name) ? 'credit' : 'bank'; }

function importCSV(text) {
  const rows = parseCSV(text);
  const head = rows.shift() || [];
  const col = n => head.indexOf(n);
  const need = ['日期', '類型', '金額', '帳戶'];
  if (need.some(n => col(n) < 0)) { toast('看不懂這個檔案，請用 DuoPurse 匯出的 CSV'); return; }
  const get = (r, n) => (col(n) >= 0 ? (r[col(n)] || '').trim() : '');
  const seen = {}, keyOf = r => { const k = head.map((h, i) => r[i]).join('|'); seen[k] = (seen[k] || 0) + 1; return k + '#' + seen[k]; };
  const have = new Set(db.expenses.filter(x => x.src).map(x => x.src));
  const acctNames = new Set(), items = [];
  for (const r of rows) {
    const date = get(r, '日期'), t = get(r, '類型'), amt = parseFloat(get(r, '金額')), local = parseFloat(get(r, '本幣金額'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amt >= 0)) continue;
    const src = 'duo:' + keyOf(r);
    const it = { date, time: get(r, '時間'), t, amt, local: isNaN(local) ? amt : local, acct: get(r, '帳戶'), to: get(r, '轉入帳戶'),
      cat: get(r, '分類'), item: get(r, '品項'), merchant: get(r, '商家'), note: get(r, '備註'), who: get(r, '記錄者'), src, dup: have.has(src) };
    if (it.acct) acctNames.add(it.acct); if (it.to) acctNames.add(it.to);
    items.push(it);
  }
  const fresh = items.filter(i => !i.dup);
  const newAccts = [...acctNames].filter(n => !db.accounts.some(a => a.name === n));
  openSheet(`<h3>從 DuoPurse 匯入</h3>
    <div class="summary"><div><span>紀錄</span><b>${items.length} 筆${items.length - fresh.length ? `（${items.length - fresh.length} 筆已經匯入過，會跳過）` : ''}</b></div>
      <div><span>帳戶</span><b>${[...acctNames].map(esc).join('、') || '—'}</b></div>
      ${newAccts.length ? `<div><span>新帳戶</span><b>會自動新增 ${newAccts.length} 個</b></div>` : ''}</div>
    <p class="hint">沒有分類的「支出」（DuoPurse 用來調整餘額的）會變成「餘額校正」，不算進收支統計。匯入後會請你確認每個帳戶現在的餘額。</p>
    <div class="btns"><button class="primary" id="i-ok"${fresh.length ? '' : ' disabled'}>匯入 ${fresh.length} 筆</button><button id="i-no">取消</button></div>`);
  $('#i-no').onclick = closeSheet;
  $('#i-ok').onclick = () => {
    db.cats = db.cats || [];
    const idOf = name => {
      if (!name) return '';
      let a = db.accounts.find(z => z.name === name);
      if (!a) { a = { id: uid(), name, type: guessAcctType(name), last4: (name.match(/\((\d{4})\)/) || [])[1] || '', init: 0 }; db.accounts.push(a); }
      return a.id;
    };
    const catKey = (name, kind) => {
      if (!name) return kind === 'income' ? 'other_in' : 'other';
      const m = (kind === 'income' ? INCAT_MAP : CAT_MAP)[name]; if (m) return m;
      let c = db.cats.find(z => z.name === name && z.kind === kind);
      if (!c) { c = { k: 'c_' + uid(), name, icon: CAT_ICON[name] || '🏷️', kind }; db.cats.push(c); }
      return c.k;
    };
    let n = 0;
    for (const i of fresh) {
      const base = { id: uid(), t: Date.parse(i.date + 'T' + (i.time || '00:00')) || Date.now(), date: i.date, src: i.src,
        acct: idOf(i.acct), merchant: i.merchant, note: [i.item, i.note].filter(Boolean).join('・'),
        payer: i.who === 'Ben' ? 'ben' : i.who === 'Sarah' ? 'sarah' : '' };
      let x;
      if (i.t === '轉帳') x = { ...base, type: 'transfer', amount: i.amt, cat: 'transfer', toAcct: idOf(i.to) };
      else if (i.t === '收入') x = { ...base, type: 'income', amount: i.amt, cat: catKey(i.cat, 'income') };
      else if (i.t === '退款') x = { ...base, type: 'income', amount: i.amt, cat: 'refund', note: base.note || (i.cat ? i.cat + '退款' : '') };
      else if (!i.cat) x = { ...base, type: 'adjust', amount: i.local, cat: 'adjust' };     // 沒分類的支出＝餘額校正
      else x = { ...base, type: 'expense', amount: i.amt, cat: catKey(i.cat, 'expense') };
      db.expenses.push(x); n++;
    }
    save(); toast(`匯入了 ${n} 筆`);
    reconcileAccounts();
  };
}

function reconcileAccounts() {     // 匯入後確認每個帳戶現在的實際餘額
  openSheet(`<h3>確認帳戶餘額</h3>
    <p class="hint">下面是照紀錄算出來的餘額。請對照 DuoPurse 或網銀，把不一樣的改成正確金額（信用卡欠款請填負數，例如 -691.84）。</p>
    ${db.accounts.map(a => `<label>${ACCT_T[a.type].icon} ${esc(a.name)}</label><input type="number" inputmode="decimal" step="0.01" data-a="${a.id}" value="${acctBalance(a)}">`).join('')}
    <div class="btns"><button class="primary" id="r-ok">確定</button><button id="r-skip">先不用</button></div>`);
  $('#r-skip').onclick = () => { closeSheet(); moneyTab = 'acct'; renderMoney(); };
  $('#r-ok').onclick = () => {
    $('#sheet').querySelectorAll('input[data-a]').forEach(inp => {
      const a = db.accounts.find(z => z.id === inp.dataset.a), want = parseFloat(inp.value);
      if (a && !isNaN(want)) a.init = Math.round(((a.init || 0) + want - acctBalance(a)) * 100) / 100;
    });
    save(); closeSheet(); moneyTab = 'acct'; renderMoney(); toast('帳戶餘額已更新');
  };
}

// ---------- 帳戶頁上方的小島（會動的雲、水、兩個人；顯示淨資產） ----------
function renderIsland(net) {
  const mon = ymd(new Date()).slice(0, 7);
  const tx = db.expenses.filter(x => x.date.slice(0, 7) === mon);
  const bal = tx.filter(x => txType(x) === 'income').reduce((s, x) => s + x.amount, 0) - tx.filter(x => txType(x) === 'expense').reduce((s, x) => s + x.amount, 0);
  const status = net < 0 ? ['透支中，加油', 'bad'] : bal >= 0 ? ['穩定累積中', 'good'] : ['這個月花比賺多', 'warn'];
  const trees = net > 10000 ? 5 : net > 3000 ? 4 : net > 0 ? 3 : 2;     // 淨資產越多，島上的樹越多
  const T = [[118, 96], [262, 92], [300, 128], [92, 132], [228, 70]].slice(0, trees)
    .map(([x, y]) => `<g transform="translate(${x},${y})"><g class="tree"><rect x="-2.5" y="0" width="5" height="12" rx="2" fill="#8B6B4A"/><ellipse cx="0" cy="-4" rx="11" ry="14" fill="#7FB07A"/><ellipse cx="-3" cy="-8" rx="4" ry="5" fill="#9CC896" opacity=".8"/></g></g>`).join('');
  return `<div class="island card"><svg viewBox="0 0 380 230" role="img" aria-label="我們的小島">
    <g class="cloud c1"><ellipse cx="60" cy="34" rx="26" ry="11" fill="#fff"/><ellipse cx="74" cy="27" rx="15" ry="11" fill="#fff"/></g>
    <g class="cloud c2"><ellipse cx="300" cy="26" rx="30" ry="12" fill="#fff"/><ellipse cx="316" cy="18" rx="17" ry="12" fill="#fff"/></g>
    <path d="M30 128 Q30 112 48 104 L172 48 Q190 40 208 48 L332 104 Q350 112 350 128 L350 146 Q350 160 332 168 L208 222 Q190 230 172 222 L48 168 Q30 160 30 146Z" fill="#E9D8B8"/>
    <path d="M30 128 Q30 112 48 104 L172 48 Q190 40 208 48 L332 104 Q350 112 350 128 L350 138 Q350 152 332 160 L208 214 Q190 222 172 214 L48 160 Q30 152 30 138Z" fill="#A8C98F"/>
    <path d="M30 122 Q30 106 48 98 L172 42 Q190 34 208 42 L332 98 Q350 106 350 122 Q350 136 332 144 L208 200 Q190 208 172 200 L48 144 Q30 136 30 122Z" fill="#C3DFA8"/>
    <path class="water" d="M232 120 Q236 104 258 104 L300 112 Q318 118 310 134 L290 150 Q276 160 256 152 L238 140 Q228 132 232 120Z" fill="#9CC9DE"/>
    <path class="shine" d="M250 122 h18 M262 134 h22" stroke="#E6F4FA" stroke-width="3" stroke-linecap="round"/>
    <path d="M150 196 Q170 160 200 150 Q216 146 228 136" stroke="#EADCC0" stroke-width="14" fill="none" stroke-linecap="round"/>
    ${T}
    <g transform="translate(150,70)"><rect x="0" y="22" width="44" height="30" rx="4" fill="#fff" stroke="#E2CDB4" stroke-width="2"/>
      <path d="M-6 25 Q-6 22 -3 20 L19 4 Q22 1 25 4 L47 20 Q50 22 50 25Z" fill="#A9CDF0"/><path d="M4 14 L19 4 Q22 1 25 4 L40 14Z" fill="#FBD98A"/><path d="M12 8.6 L19 4 Q22 1 25 4 L32 8.6Z" fill="#F7B6C8"/>
      <rect x="17" y="34" width="10" height="18" rx="2" fill="#F7B6C8"/><rect x="5" y="30" width="8" height="8" rx="2" fill="#A9CDF0"/><rect x="31" y="30" width="8" height="8" rx="2" fill="#FBD98A"/></g>
    <image class="bob b1" href="icons/boy.svg" x="164" y="128" width="30" height="30"/>
    <image class="bob b2" href="icons/girl.svg" x="194" y="130" width="30" height="30"/>
  </svg>
  <div class="isl-net"><span>我們的淨資產</span><b class="${net >= 0 ? 'pos' : 'neg'}">${money(net)}</b><em class="${status[1]}">${status[0]}</em></div></div>`;
}

// ====================================================================
// 庫存＋採買清單（兩人共用）
// ====================================================================
const ICONS = ['🧴', '🧻', '🧼', '🪥', '🧽', '🧺', '🥚', '🥛', '🍞', '🧀', '🍚', '🍜', '☕', '🧂', '🍳', '🥫', '🍎', '🐱', '💊', '📦'];
let stockTab = 'stock';
const isLow = s => s.qty <= s.low;
const fmtQty = n => Math.round(n * 100) / 100;

function renderStock() {
  const lows = db.stock.filter(isLow), oks = db.stock.filter(s => !isLow(s)).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  const shopCount = lows.length + db.shop.filter(x => !x.done).length;
  document.querySelectorAll('.stabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === stockTab));
  $('#shop-badge').textContent = shopCount || '';
  $('#shop-badge').hidden = !shopCount;
  $('#stock-view').hidden = stockTab !== 'stock';
  $('#shop-view').hidden = stockTab !== 'shop';
  const row = s => {
    const pct = Math.min(100, s.qty / Math.max(s.low * 3, s.qty, 1) * 100), mark = Math.min(100, s.low / Math.max(s.low * 3, s.qty, 1) * 100);
    return `<div class="srow${isLow(s) ? ' low' : ''}" data-id="${s.id}">
      <span class="si">${s.icon}</span>
      <div class="sm"><b data-edit="1">${esc(s.name)}</b><div class="bar"><i style="width:${pct}%"></i><em style="left:${mark}%"></em></div></div>
      <span class="sq">${fmtQty(s.qty)}<small>${esc(s.unit)}</small></span>
      <span class="spm"><button data-d="-1" aria-label="少一個">−</button><button data-d="1" aria-label="多一個">＋</button></span>
    </div>`;
  };
  $('#stock-list').innerHTML =
    (lows.length ? `<div class="sec low">需要補貨（${lows.length}）</div>${lows.map(row).join('')}` : '') +
    `<div class="sec">其他用品（${oks.length}）</div>${oks.map(row).join('') || '<p class="empty">還沒有用品，按「＋ 新增」加一個</p>'}`;
  const manual = db.shop;
  $('#shop-list').innerHTML =
    (lows.length ? `<div class="sec low">庫存偏低（自動加入）</div>` + lows.map(s => `<button class="shrow" data-stock="${s.id}">
      <span class="box"></span><span>${s.icon} ${esc(s.name)}</span><small>剩 ${fmtQty(s.qty)} ${esc(s.unit)}</small></button>`).join('') : '') +
    `<div class="sec">自己加的</div>` +
    (manual.length ? manual.map(x => `<button class="shrow${x.done ? ' done' : ''}" data-shop="${x.id}"><span class="box"></span><span>${esc(x.name)}</span></button>`).join('')
      : '<p class="empty">在上面輸入要買的東西</p>') +
    (manual.some(x => x.done) ? '<div class="btns"><button id="shop-clear">清掉已買的</button></div>' : '');
  if ($('#shop-clear')) $('#shop-clear').onclick = () => { db.shop = db.shop.filter(x => !x.done); save(); renderStock(); };
}

function openStock(s) {
  const isNew = !s;
  const v = s || { name: '', icon: '📦', qty: 1, unit: '個', low: 1 };
  openSheet(`
    <h3>${isNew ? '新增用品' : '修改用品'}</h3>
    <label>名稱</label><input id="s-name" value="${esc(v.name)}" placeholder="例如：沐浴乳">
    <label>圖示</label><div class="icongrid">${ICONS.map(i => `<button type="button" class="${i === v.icon ? 'on' : ''}">${i}</button>`).join('')}</div>
    <div class="row2"><div><label>現在有幾個</label><input id="s-qty" type="number" inputmode="decimal" min="0" step="any" value="${v.qty}"></div>
      <div><label>單位</label><input id="s-unit" value="${esc(v.unit)}" placeholder="瓶、包、顆"></div></div>
    <label>剩幾個以下要提醒補貨？</label><input id="s-low" type="number" inputmode="decimal" min="0" step="any" value="${v.low}">
    <p class="err" id="s-err"></p>
    <div class="btns"><button class="primary" id="s-save">儲存</button>
      ${isNew ? '' : '<button class="danger" id="s-del">刪除</button>'}<button id="s-cancel">取消</button></div>`);
  if (isNew) setTimeout(() => $('#s-name').focus(), 50);
  $('#sheet .icongrid').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    $('#sheet .icongrid').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); };
  $('#s-cancel').onclick = closeSheet;
  $('#s-save').onclick = () => {
    const name = $('#s-name').value.trim(), qty = parseFloat($('#s-qty').value), low = parseFloat($('#s-low').value);
    if (!name) return $('#s-err').textContent = '請寫名稱';
    if (!(qty >= 0) || !(low >= 0)) return $('#s-err').textContent = '數量請填數字';
    const data = { name, icon: $('#sheet .icongrid .on').textContent, qty, unit: $('#s-unit').value.trim() || '個', low };
    if (isNew) db.stock.push({ id: uid(), ...data }); else Object.assign(s, data);
    save(); closeSheet(); renderStock(); toast('已儲存');
  };
  if (!isNew) $('#s-del').onclick = () => { db.stock = db.stock.filter(z => z !== s); save(); closeSheet(); renderStock(); toast('已刪除'); };
}

function buyStock(s) {   // 採買清單勾選庫存品 → 問買了幾個，加回庫存
  const suggest = Math.max(1, Math.ceil(s.low * 2 - s.qty));
  openSheet(`<h3>${s.icon} ${esc(s.name)} 買了幾${esc(s.unit)}？</h3>
    <input id="b-n" type="number" inputmode="decimal" min="0" step="any" value="${suggest}" class="big">
    <p class="hint">會加到庫存裡（現在剩 ${fmtQty(s.qty)} ${esc(s.unit)}）</p>
    <div class="btns"><button class="primary" id="b-ok">買好了</button><button id="b-no">取消</button></div>`);
  $('#b-no').onclick = closeSheet;
  $('#b-ok').onclick = () => { const n = parseFloat($('#b-n').value) || 0; s.qty = fmtQty(s.qty + n); save(); closeSheet(); renderStock(); toast('已補貨'); };
}

function bindMoneyStock() {
  $('#money-prev').onclick = () => { const [y, m] = moneyMonth.split('-').map(Number); moneyMonth = ymd(new Date(y, m - 2, 1)).slice(0, 7); renderMoney(); };
  $('#money-next').onclick = () => { const [y, m] = moneyMonth.split('-').map(Number); moneyMonth = ymd(new Date(y, m, 1)).slice(0, 7); renderMoney(); };
  $('#money-add').onclick = () => openExpense(null);
  $('#money-list').onclick = e => { const b = e.target.closest('.xrow'); if (!b) return; const x = db.expenses.find(z => z.id === b.dataset.id); if (!x) return;
    if (txType(x) === 'adjust') openAdjust(x); else openExpense(x); };
  document.querySelectorAll('.mntabs button').forEach(b => b.onclick = () => { moneyTab = b.dataset.tab; renderMoney(); });
  document.querySelectorAll('.st-kind button').forEach(b => b.onclick = () => { statKind = b.dataset.k; renderMoney(); });
  document.querySelectorAll('.st-by button').forEach(b => b.onclick = () => { statBy = b.dataset.b; renderMoney(); });
  $('#money-acct').onclick = e => { const b = e.target.closest('.arow'); if (b) openAccount(db.accounts.find(a => a.id === b.dataset.id)); };
  $('#csv-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) f.text().then(importCSV); };
  document.querySelectorAll('.stabs button').forEach(b => b.onclick = () => { stockTab = b.dataset.tab; renderStock(); });
  $('#stock-add').onclick = () => openStock(null);
  $('#stock-list').onclick = e => {
    const r = e.target.closest('.srow'); if (!r) return;
    const s = db.stock.find(x => x.id === r.dataset.id); if (!s) return;
    const pm = e.target.closest('[data-d]');
    if (pm) { s.qty = Math.max(0, fmtQty(s.qty + Number(pm.dataset.d))); save(); renderStock(); return; }
    openStock(s);
  };
  $('#shop-form').onsubmit = e => {
    e.preventDefault(); const v = $('#shop-input').value.trim(); if (!v) return;
    db.shop.push({ id: uid(), name: v, done: false }); $('#shop-input').value = ''; save(); renderStock();
  };
  $('#shop-list').addEventListener('click', e => {
    const b = e.target.closest('.shrow'); if (!b) return;
    if (b.dataset.stock) { const s = db.stock.find(x => x.id === b.dataset.stock); if (s) buyStock(s); return; }
    const x = db.shop.find(z => z.id === b.dataset.shop); if (x) { x.done = !x.done; save(); renderStock(); }
  });
}

buildHours(); bind(); bindMove(); bindMonth(); bindMoneyStock(); render(); scrollToNow();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
