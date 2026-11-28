'use strict';
// 我們的行事曆（Sarah & Ben）— 試用版：資料只存在這支手機（localStorage）
// 之後接雲端同步時，只要換掉 Store 這一段。
const APP_VERSION = '0.16.0';
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
  ['day', 'month', 'stock'].forEach(n => $('#page-' + n).hidden = n !== name);
  document.body.className = 'th-' + name;                      // 每個分頁不同顏色
  const tc = { day: '#E2EEFA', month: '#FBE3EA', stock: '#ECE6F7' }[name];
  document.querySelector('meta[name=theme-color]').setAttribute('content', tc);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.page === name));
  if (name === 'month') { mCur = sel.slice(0, 7); renderMonth(); }
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
// 庫存＋採買清單（兩人共用）
// ====================================================================
const ICONS = ['🧴', '🧻', '🧼', '🪥', '🧽', '🧺', '🥚', '🥛', '🍞', '🧀', '🍚', '🍜', '☕', '🧂', '🍳', '🥫', '🍎', '🐱', '💊', '📦'];
let stockTab = 'stock';
const isLow = s => s.qty <= s.low;
const fmtQty = n => Math.round(n * 100) / 100;

// ---------- v0.17 庫存區域＋小房子（參考 HomeStock，Adam 原創 SVG） ----------
// db.zones：[{ id, name, icon, spot }]；spot＝房子裡的位置（fridge/counter/sink/shower 是家具，f1–f5 是地上的紙箱）
// db.stock 每一項多一個 zone（區域 id，'' ＝未分區）
const SPOTS = { fridge: [0.8, 0.8, 2.8], counter: [3.1, 0.7, 1.25], pantry: [.6, 3.3, 1.9], toilet: [8.0, 1.2, 1.5], bed: [1.8, 7.3, .8],
  f1: [2.4, 4.8, .6], f2: [5.6, 9.2, .6], f3: [9.2, 9.1, .6], f4: [3.9, 9.3, .6], f5: [8.9, 6.0, .6] };
const ZICONS = ['🧊', '🍳', '🥫', '🛁', '🚽', '🚰', '🚿', '🛋️', '🛏️', '🧺', '🚪', '🐱', '🚗', '📦', '🗄️', '🪴', '🧸'];
if (!db.zones) {
  db.zones = [{ id: 'z-fridge', name: '冰箱', icon: '🧊', spot: 'fridge' }, { id: 'z-counter', name: '流理臺', icon: '🍳', spot: 'counter' },
    { id: 'z-sink', name: '洗手台', icon: '🚰', spot: 'sink' }, { id: 'z-shower', name: '淋浴間', icon: '🚿', spot: 'shower' }];
  const guess = n => /蛋|奶|起司|乳酪|肉|火腿|菜|果|優格/.test(n) ? 'z-fridge' : /洗髮|沐浴|潤髮/.test(n) ? 'z-shower'
    : /牙|洗手|洗面|刮鬍|衛生紙/.test(n) ? 'z-sink' : /米|麵|油|鹽|糖|醬|洗碗|菜瓜布/.test(n) ? 'z-counter' : '';
  db.stock.forEach(s => { if (s.zone === undefined) s.zone = guess(s.name); });
  save();
}
if ((db.zoneV || 1) < 2) {
  const sink = db.zones.find(z => z.spot === 'sink'), shower = db.zones.find(z => z.spot === 'shower');
  let wc = shower || db.zones.find(z => z.spot === 'toilet');
  if (!wc) { wc = { id: 'z-wc', name: '廁所', icon: '🚽', spot: 'toilet' }; db.zones.push(wc); }
  Object.assign(wc, { name: shower && shower.name !== '淋浴間' ? shower.name : '廁所', icon: shower && shower.name !== '淋浴間' ? shower.icon : '🚽', spot: 'toilet' });
  if (sink) { db.stock.forEach(s => { if (s.zone === sink.id) s.zone = wc.id; }); db.zones = db.zones.filter(z => z !== sink); }
  if (!db.zones.some(z => z.spot === 'bed')) db.zones.push({ id: 'z-room', name: '房間', icon: '🛏️', spot: 'bed' });
  db.zones.forEach(z => { if (z.spot && !SPOTS[z.spot]) z.spot = ''; });
  db.zoneV = 2; save();
}
if ((db.zoneV || 1) < 3) {
  const wc = db.zones.find(z => z.spot === 'toilet');
  if (wc && wc.name === '廁所') Object.assign(wc, { name: '浴室廁所', icon: '🛁' });
  if (!db.zones.some(z => z.spot === 'pantry')) {
    const pz = { id: 'z-pantry', name: '儲藏櫃', icon: '🥫', spot: 'pantry' }; db.zones.push(pz);
    db.stock.forEach(s => { if ((!db.zones.some(z => z.id === s.zone) || s.zone === 'z-counter') && /泡麵|麵|醬|鹽|糖|胡椒|調味|罐頭|醋|味精/.test(s.name)) s.zone = pz.id; });
  }
  db.zoneV = 3; save();
}
let selZone = '';                       // '' ＝全部；'_none' ＝未分區；其他＝區域 id
const zoneOf = id => db.zones.find(z => z.id === id);
const inZone = (s, z) => z === '' ? true : z === '_none' ? !zoneOf(s.zone) : s.zone === z;

// 等角投影：房間 10×10 格，牆高 3
const ISO = (x, y, z = 0) => [180 + (x - y) * 15, 58 + (x + y) * 7.5 - z * 13];
const P = a => a.map(p => ISO(...p).map(n => n.toFixed(1)).join(',')).join(' ');
const poly = (a, fill, extra = '') => `<polygon points="${P(a)}" fill="${fill}" ${extra}/>`;
function box(x, y, w, d, h, top, left, right, z0 = 0) {
  return poly([[x, y + d, z0], [x + w, y + d, z0], [x + w, y + d, z0 + h], [x, y + d, z0 + h]], left) +
    poly([[x + w, y, z0], [x + w, y + d, z0], [x + w, y + d, z0 + h], [x + w, y, z0 + h]], right) +
    poly([[x, y, z0 + h], [x + w, y, z0 + h], [x + w, y + d, z0 + h], [x, y + d, z0 + h]], top);
}
function tiles(x0, y0, x1, y1, a, b) {
  let h = '';
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) h += poly([[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], (x + y) % 2 ? a : b);
  return h;
}
function houseStatic() {
  // v0.20 格局：後左＝廚房（冰箱、流理臺、儲藏櫃）、後右＝浴室廁所（浴缸＋馬桶）、前左＝房間（離浴室最遠）、前右＝客廳
  let h = '';
  h += box(-1.2, -1.2, 12.4, 12.4, .3, '#BFDDA6', '#A3C98B', '#93BB7C', -.7);                    // 草地
  h += box(0, 0, 10, 10, .4, '#E9C99B', '#C9A77A', '#B8966A', -.4);                                // 地板
  h += tiles(0, 0, 5, 4, '#F6E3C9', '#FBEFDF') + tiles(5, 0, 10, 4, '#D4E8F1', '#EEF6FA');         // 廚房、浴室地磚
  for (let y = 4.5; y < 10; y += 1) h += `<polyline points="${P([[0, y], [10, y]])}" stroke="#DDB989" stroke-width=".8" fill="none"/>`;
  h += poly([[0, 5.55], [4.7, 5.55], [4.7, 10], [0, 10]], '#F2DDC0');                                // 房間地板
  h += poly([[1.0, 8.95], [4.3, 8.95], [4.3, 9.8], [1.0, 9.8]], '#F6D6DC', 'opacity=".9"');          // 房間地毯
  h += poly([[5.8, 5.7], [9.6, 5.7], [9.6, 8.4], [5.8, 8.4]], '#F7D88F', 'opacity=".85"');           // 客廳地毯
  // 後面兩道牆＋窗
  h += poly([[0, 0, 0], [5, 0, 0], [5, 0, 3], [0, 0, 3]], '#F6E7D6') + poly([[5, 0, 0], [10, 0, 0], [10, 0, 3], [5, 0, 3]], '#E2EEF4');
  h += poly([[0, 0, 0], [0, 5.5, 0], [0, 5.5, 3], [0, 0, 3]], '#F6E7D6') + poly([[0, 5.5, 0], [0, 10, 0], [0, 10, 3], [0, 5.5, 3]], '#F1DCE3');
  h += poly([[-.3, -.3, 3], [10, -.3, 3], [10, 0, 3], [0, 0, 3], [0, 10, 3], [-.3, 10, 3]], '#CDB8A4');
  const win = (a, fill = '#BFE0F2') => poly(a, fill, 'stroke="#fff" stroke-width="2"');
  h += win([[2.2, 0, 1.7], [3.6, 0, 1.7], [3.6, 0, 2.7], [2.2, 0, 2.7]]) + win([[6.6, 0, 1.8], [7.6, 0, 1.8], [7.6, 0, 2.7], [6.6, 0, 2.7]]);
  h += win([[0, 8.8, 1.3], [0, 9.7, 1.3], [0, 9.7, 2.5], [0, 8.8, 2.5]]);
  h += poly([[0, 6.6, 1.7], [0, 7.8, 1.7], [0, 7.8, 2.5], [0, 6.6, 2.5]], '#F2A7B5', 'stroke="#fff" stroke-width="1.5"');   // 床頭上的畫
  // 廚房：冰箱
  h += box(.15, .2, 1.3, 1.2, 2.8, '#C6ECE1', '#8FD1C1', '#7BC0B0');
  h += `<polyline points="${P([[.15, 1.41, 1.9], [1.45, 1.41, 1.9]])}" stroke="#6FB2A2" stroke-width="1" fill="none"/>`;
  h += `<polyline points="${P([[1.2, 1.42, 1.1], [1.2, 1.42, 1.7]])} ${P([[1.2, 1.42, 2.1], [1.2, 1.42, 2.6]])}" stroke="#fff" stroke-width="1.4" stroke-linecap="round" fill="none"/>`;
  // 廚房：儲藏櫃（調味料、泡麵）— 靠左牆、冰箱前面
  h += box(.15, 1.6, .95, 1.8, 2.4, '#EBD3B4', '#D9B78C', '#C9A57A');
  h += `<polyline points="${P([[1.11, 2.5, .1], [1.11, 2.5, 2.3]])}" stroke="#B48E62" stroke-width="1" fill="none"/>`;
  h += `<polyline points="${P([[1.11, 1.6, 1.2], [1.11, 3.4, 1.2]])}" stroke="#B48E62" stroke-width="1" fill="none"/>`;
  [[2.3, 1.5], [2.7, 1.5], [2.3, 1.9], [2.7, 1.9]].forEach(([y, z]) => h += `<polyline points="${P([[1.11, y, z], [1.11, y, z + .3]])}" stroke="#fff" stroke-width="1.4" stroke-linecap="round" fill="none"/>`);
  { [[.55, 2.0, '#E9776B'], [.6, 2.45, '#F2C14E'], [.55, 2.9, '#7FB07A']].forEach(([x, y, c]) => h += box(x - .12, y - .12, .24, .24, .32, c, c, c, 2.4)); }   // 櫃子上的調味罐
  // 流理臺（水槽＋爐子）
  h += box(1.6, .15, 3.1, 1.1, 1.25, '#FFFFFF', '#ECCDA5', '#DBB88C');
  h += poly([[1.9, .35, 1.26], [2.8, .35, 1.26], [2.8, 1.05, 1.26], [1.9, 1.05, 1.26]], '#C9DEE9');
  h += poly([[3.3, .35, 1.26], [4.4, .35, 1.26], [4.4, 1.05, 1.26], [3.3, 1.05, 1.26]], '#4A3A3F', 'opacity=".75"');
  [[3.6, .7], [4.1, .7]].forEach(([x, y]) => { const [cx, cy] = ISO(x, y, 1.27); h += `<ellipse cx="${cx}" cy="${cy}" rx="3.4" ry="1.7" fill="none" stroke="#F2A7B5" stroke-width="1"/>`; });
  [2.3, 3.4].forEach(x => h += `<polyline points="${P([[x, 1.26, .3], [x, 1.26, 1]])}" stroke="#C9A97E" stroke-width="1" fill="none"/>`);
  // 廚房和浴室中間的矮牆
  h += box(4.9, 0, .2, 2.8, 1.6, '#CDB8A4', '#EADFD3', '#F1E6DA');
  // 浴室廁所：馬桶＋浴缸＋毛巾
  h += poly([[5.6, 1.6], [7.9, 1.6], [7.9, 2.8], [5.6, 2.8]], '#B9D9E8', 'opacity=".55"');                 // 腳踏墊
  h += box(6.0, .15, 1.1, .4, 1.45, '#FFFFFF', '#EEF3F6', '#DCE5EA') + box(6.1, .55, .9, 1, .7, '#FFFFFF', '#F2F6F8', '#DCE5EA');
  h += poly([[6.25, .7, .71], [6.85, .7, .71], [6.85, 1.4, .71], [6.25, 1.4, .71]], '#D6E6EE');
  h += box(8.2, .15, 1.7, 2.7, .85, '#FFFFFF', '#EEF3F6', '#DCE5EA');                                     // 浴缸
  h += poly([[8.4, .35, .86], [9.7, .35, .86], [9.7, 2.65, .86], [8.4, 2.65, .86]], '#A9D3EA');
  h += `<polyline points="${P([[8.8, .9, .87], [9.3, .9, .87]])} " stroke="#E6F4FA" stroke-width="1.5" stroke-linecap="round" fill="none"/>`;
  h += `<polyline points="${P([[9.0, 0, 2.2], [9.0, .4, 2.0]])}" stroke="#9FB6C4" stroke-width="2" stroke-linecap="round" fill="none"/>`;   // 水龍頭
  h += poly([[7.4, 0, 1.7], [8.0, 0, 1.7], [8.0, 0, 2.2], [7.4, 0, 2.2]], '#F2B8C2');                     // 毛巾
  h += box(6.2, 3.9, 3.8, .2, 1.4, '#CDB8A4', '#EADFD3', '#F1E6DA');                                     // 浴室和客廳中間的牆
  // 房間（前左，離浴室最遠）：矮牆、床、床頭櫃
  h += box(0, 5.45, 3.4, .2, 1.4, '#CDB8A4', '#EADFD3', '#F1E6DA');                                       // 走道和房間中間（門在右邊）
  h += box(.15, 6.1, .3, 2.5, 1.25, '#C9B0D9', '#B79BC9', '#A88BBB');                                    // 床頭板
  h += box(.45, 6.1, 2.6, 2.5, .55, '#FFFFFF', '#E3D7EC', '#D6C7E2');
  h += box(1.4, 6.1, 1.65, 2.5, .58, '#C7B2DE', '#B39BCF', '#A58DC2');                                    // 被子
  h += box(.55, 6.3, .6, .95, .7, '#FFF8F0', '#F1E6DA', '#E6D8C8') + box(.55, 7.45, .6, .95, .7, '#FFF8F0', '#F1E6DA', '#E6D8C8');
  h += box(.15, 8.75, .5, .5, .65, '#EBD3B4', '#D4B48C', '#C4A37A');
  // 客廳（前右）：沙發靠浴室那道牆、盆栽
  h += box(6.4, 4.15, 3.2, 1.1, .7, '#8CC3B3', '#73AE9E', '#65A090') + box(6.4, 4.15, 3.2, .4, 1.45, '#8CC3B3', '#73AE9E', '#65A090');
  h += box(6.1, 4.15, .3, 1.2, 1, '#8CC3B3', '#73AE9E', '#65A090') + box(9.6, 4.15, .3, 1.2, 1, '#8CC3B3', '#73AE9E', '#65A090');
  h += box(5.3, 4.25, .5, .5, .5, '#C98F6A', '#B97E59', '#A96F4C');
  { const [px, py] = ISO(5.55, 4.5, 1.2); h += `<circle cx="${px}" cy="${py - 4}" r="7" fill="#86BE7E"/><circle cx="${px + 4}" cy="${py - 8}" r="4.5" fill="#9CCD93"/>`; }
  h += box(4.6, 5.55, .2, 4.45, 1.4, '#CDB8A4', '#EADFD3', '#F1E6DA');                                    // 房間和客廳中間（最後畫，在前面）
  return h;
}
const TABLE = [7.1, 6.3, 1.6, 1.0];        // 茶几（人物會繞過、前後遮擋要排序）
function houseSVG() {
  const zs = db.zones.filter(z => SPOTS[z.spot]);
  let crates = '';
  zs.filter(z => z.spot[0] === 'f').forEach(z => { const [x, y] = SPOTS[z.spot]; crates += box(x - .35, y - .35, .7, .7, .6, '#EDCB94', '#D8AE70', '#C79C5E'); });
  const bubbles = zs.map(z => {
    const [x, y, zz] = SPOTS[z.spot], [bx, by] = ISO(x, y, zz + .2);
    const items = db.stock.filter(s => s.zone === z.id), lows = items.filter(isLow).length;
    const w = z.name.length * 10.5 + 40;
    return `<g class="zb${selZone === z.id ? ' on' : ''}${lows ? ' low' : ''}" data-zone="${z.id}" transform="translate(${bx.toFixed(1)},${by.toFixed(1)})">
      <path d="M-4 -6 L0 0 L4 -6Z" class="tip"/><rect x="${-w / 2}" y="-23" width="${w}" height="18" rx="9"/>
      <text x="${-w / 2 + 7}" y="-10.2">${z.icon} ${esc(z.name)}</text>
      <circle cx="${w / 2 - 10}" cy="-14" r="6.4" class="cnt"/><text x="${w / 2 - 10}" y="-10.8" class="n">${lows || items.length}</text></g>`;
  }).join('');
  const [tx, ty, tw, td] = TABLE;
  return `<svg viewBox="0 0 360 226" role="img" aria-label="家裡的小房子">${houseStatic()}${crates}
    <g id="hs-movers">
      <g class="mv" id="mv-table" data-d="${tx + tw / 2 + ty + td / 2}">${box(tx, ty, tw, td, .55, '#EBC495', '#D3A472', '#C29462')}</g>
      <g class="mv person" id="mv-ben"><g class="flip">${charBen()}</g></g>
      <g class="mv person" id="mv-sarah"><g class="flip">${charSarah()}</g></g>
      <g class="mv pet" id="mv-cat"><g class="flip"><g class="walk">${charCat('hs-catmask')}</g></g></g>
    </g>${bubbles}</svg>`;
}

// 人和貓在客廳走來走去
let houseRaf = 0;
function houseWalkable(x, y) {
  if (x < .5 || x > 9.6 || y < 4.35 || y > 9.6) return false;
  if (y > 5.3 && y < 5.8 && x < 3.5) return false;                                           // 房間上面的矮牆（門在 x 3.5–4.6）
  if (x > 4.45 && x < 4.95 && y > 5.4) return false;                                         // 房間和客廳中間的牆
  if (x < 3.3 && y > 5.9 && y < 9.4) return false;                                           // 床、床頭櫃
  if (x > 5.0 && x < 6.0 && y < 4.9) return false;                                           // 盆栽
  if (x > 5.9 && y < 5.5) return false;                                                      // 沙發
  if (x > TABLE[0] - .5 && x < TABLE[0] + TABLE[2] + .3 && y > TABLE[1] - .4 && y < TABLE[1] + TABLE[3] + .4) return false;
  return !db.zones.some(z => z.spot && z.spot[0] === 'f' && SPOTS[z.spot] && Math.hypot(SPOTS[z.spot][0] - x, SPOTS[z.spot][1] - y) < .8);
}
function houseSpot() { for (let i = 0; i < 80; i++) { const x = .5 + Math.random() * 9.1, y = 4.4 + Math.random() * 5.2; if (houseWalkable(x, y)) return [x, y]; } return [6, 9]; }
function startHouse() {
  cancelAnimationFrame(houseRaf);
  const movers = [['mv-ben', 2.6, 8.4, .55, .62], ['mv-sarah', 5.6, 8.6, .55, .62], ['mv-cat', 7.4, 6.6, .9, .5]].map(([id, x, y, speed, size]) => {
    const el = document.getElementById(id); if (!el) return null;
    if (!houseWalkable(x, y)) [x, y] = houseSpot();
    return { el, x, y, tx: x, ty: y, speed, size, dir: 1, wait: 600 + Math.random() * 2500 };
  }).filter(Boolean);
  if (!movers.length) return;
  const group = document.getElementById('hs-movers'), table = document.getElementById('mv-table');
  let last = performance.now();
  const step = now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!document.body.contains(group) || $('#page-stock').hidden) return;          // 換頁就停
    for (const p of movers) {
      if (p.wait > 0) { p.wait -= dt * 1000; p.el.classList.remove('moving'); }
      else {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d < .05) { [p.tx, p.ty] = houseSpot(); p.wait = 1200 + Math.random() * 3500; }
        else {
          const v = Math.min(d, p.speed * dt), nx = p.x + dx / d * v, ny = p.y + dy / d * v;
          if (houseWalkable(nx, ny) || !houseWalkable(p.x, p.y)) { p.x = nx; p.y = ny; } else [p.tx, p.ty] = houseSpot();
          const sdx = dx - dy;                                                         // 螢幕上的左右
          if (Math.abs(sdx) > .02) p.dir = sdx > 0 ? 1 : -1;
          p.el.classList.add('moving');
        }
      }
      const [sx, sy] = ISO(p.x, p.y);
      p.el.setAttribute('transform', `translate(${sx.toFixed(1)},${sy.toFixed(1)})`);
      p.el.firstElementChild.setAttribute('transform', `scale(${p.dir * p.size},${p.size})`);
      p.el.dataset.d = p.x + p.y;
    }
    [table, ...movers.map(p => p.el)].sort((a, b) => a.dataset.d - b.dataset.d).forEach(n => group.appendChild(n));
    houseRaf = requestAnimationFrame(step);
  };
  houseRaf = requestAnimationFrame(step);
}

// 區域管理
function openZones() {
  const cnt = id => db.stock.filter(s => s.zone === id).length;
  openSheet(`<h3>家裡的區域</h3>
    <div class="zlist">${db.zones.map(z => `<button class="zrow" data-id="${z.id}"><span>${z.icon}</span><b>${esc(z.name)}</b><small>${cnt(z.id)} 樣</small><span class="chev">›</span></button>`).join('')
      || '<p class="empty">還沒有區域</p>'}</div>
    <div class="btns"><button class="primary" id="z-add">＋ 新增區域</button><button id="z-close">完成</button></div>
    <p class="hint">新增的區域會在小房子地上多一個紙箱（最多 5 個），超過的只出現在下面的按鈕。</p>`);
  $('#z-close').onclick = closeSheet;
  $('#z-add').onclick = () => editZone(null);
  $('#sheet .zlist').onclick = e => { const b = e.target.closest('.zrow'); if (b) editZone(zoneOf(b.dataset.id)); };
}
function editZone(z) {
  const isNew = !z, v = z || { name: '', icon: '📦' };
  openSheet(`<h3>${isNew ? '新增區域' : '修改區域'}</h3>
    <label>名稱</label><input id="z-name" value="${esc(v.name)}" placeholder="例如：客廳、儲藏室">
    <label>圖示</label><div class="icongrid">${ZICONS.map(i => `<button type="button" class="${i === v.icon ? 'on' : ''}">${i}</button>`).join('')}</div>
    <p class="err" id="z-err"></p>
    <div class="btns"><button class="primary" id="z-save">儲存</button>${isNew ? '' : '<button class="danger" id="z-del">刪除</button>'}<button id="z-back">取消</button></div>
    ${isNew ? '' : '<p class="hint">刪除區域不會刪掉裡面的用品，它們會變成「未分區」。</p>'}`);
  if (isNew) setTimeout(() => $('#z-name').focus(), 50);
  $('#sheet .icongrid').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    $('#sheet .icongrid').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#z-back').onclick = openZones;
  $('#z-save').onclick = () => {
    const name = $('#z-name').value.trim(); if (!name) return $('#z-err').textContent = '請寫名稱';
    const icon = ($('#sheet .icongrid .on') || {}).textContent || '📦';
    if (isNew) {
      const used = new Set(db.zones.map(x => x.spot)), spot = ['f1', 'f2', 'f3', 'f4', 'f5'].find(f => !used.has(f)) || '';
      db.zones.push({ id: uid(), name, icon, spot });
    } else Object.assign(z, { name, icon });
    save(); renderStock(); openZones(); toast('已儲存');
  };
  if (!isNew) $('#z-del').onclick = () => {
    db.stock.forEach(s => { if (s.zone === z.id) s.zone = ''; });
    db.zones = db.zones.filter(x => x !== z); if (selZone === z.id) selZone = '';
    save(); renderStock(); openZones(); toast('已刪除區域');
  };
}

function renderStock() {
  if (selZone && selZone !== '_none' && !zoneOf(selZone)) selZone = '';
  const allLows = db.stock.filter(isLow);
  const mine = db.stock.filter(s => inZone(s, selZone));
  const lows = mine.filter(isLow), oks = mine.filter(s => !isLow(s)).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  const shopCount = allLows.length + db.shop.filter(x => !x.done).length;
  document.querySelectorAll('.stabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === stockTab));
  $('#shop-badge').textContent = shopCount || '';
  $('#shop-badge').hidden = !shopCount;
  $('#stock-view').hidden = stockTab !== 'stock';
  $('#shop-view').hidden = stockTab !== 'shop';
  $('#log-view').hidden = stockTab !== 'log';
  if (stockTab === 'log') renderBuyLog();
  const row = s => {
    const pct = Math.min(100, s.qty / Math.max(s.low * 3, s.qty, 1) * 100), mark = Math.min(100, s.low / Math.max(s.low * 3, s.qty, 1) * 100);
    return `<div class="srow${isLow(s) ? ' low' : ''}" data-id="${s.id}">
      <span class="si">${s.icon}</span>
      <div class="sm"><b data-edit="1">${esc(s.name)}</b><div class="bar"><i style="width:${pct}%"></i><em style="left:${mark}%"></em></div></div>
      <span class="sq">${fmtQty(s.qty)}<small>${esc(s.unit)}</small></span>
      ${isLow(s) ? `<button class="sbuy" data-buy="1">🛒 買了</button>` : ''}<span class="spm"><button data-d="-1" aria-label="少一個">−</button><button data-d="1" aria-label="多一個">＋</button></span>
    </div>`;
  };
  if (stockTab === 'stock') {
    $('#house').innerHTML = houseSVG();
    const n = id => db.stock.filter(s => inZone(s, id)).length, none = n('_none');
    $('#zchips').innerHTML = `<button data-z="" class="${selZone === '' ? 'on' : ''}">全部 <small>${db.stock.length}</small></button>` +
      db.zones.map(z => `<button data-z="${z.id}" class="${selZone === z.id ? 'on' : ''}${db.stock.some(s => s.zone === z.id && isLow(s)) ? ' low' : ''}">${z.icon} ${esc(z.name)} <small>${n(z.id)}</small></button>`).join('') +
      (none ? `<button data-z="_none" class="${selZone === '_none' ? 'on' : ''}">未分區 <small>${none}</small></button>` : '') +
      `<button class="zedit" id="zone-edit">✎ 區域</button>`;
    startHouse();
  }
  let body = lows.length ? `<div class="sec low">需要補貨（${lows.length}）</div>${lows.map(row).join('')}` : '';
  if (selZone === '') {           // 全部：依區域分段
    db.zones.forEach(z => { const g = oks.filter(s => s.zone === z.id); if (g.length) body += `<div class="sec">${z.icon} ${esc(z.name)}（${g.length}）</div>${g.map(row).join('')}`; });
    const g = oks.filter(s => !zoneOf(s.zone)); if (g.length) body += `<div class="sec">未分區（${g.length}）</div>${g.map(row).join('')}`;
    if (!db.stock.length) body += '<p class="empty">還沒有用品，按「＋ 新增」加一個</p>';
  } else {
    const z = zoneOf(selZone);
    body += `<div class="sec">${z ? z.icon + ' ' + esc(z.name) : '未分區'}（${oks.length}）</div>${oks.map(row).join('')}`;
    if (!mine.length) body += '<p class="empty">這裡還沒有東西，按「＋ 新增」加一個</p>';
  }
  $('#stock-list').innerHTML = body;
  const manual = db.shop;
  $('#shop-list').innerHTML =
    (allLows.length ? `<div class="sec low">庫存偏低（自動加入）</div>` + allLows.map(s => `<button class="shrow" data-stock="${s.id}">
      <span class="box"></span><span>${s.icon} ${esc(s.name)}</span><small>${zoneOf(s.zone) ? esc(zoneOf(s.zone).name) + '・' : ''}剩 ${fmtQty(s.qty)} ${esc(s.unit)}</small></button>`).join('') : '') +
    `<div class="sec">自己加的</div>` +
    (manual.length ? manual.map(x => `<button class="shrow${x.done ? ' done' : ''}" data-shop="${x.id}"><span class="box"></span><span>${esc(x.name)}</span></button>`).join('')
      : '<p class="empty">在上面輸入要買的東西</p>') +
    (manual.some(x => x.done) ? '<div class="btns"><button id="shop-clear">清掉已買的</button></div>' : '');
  if ($('#shop-clear')) $('#shop-clear').onclick = () => { db.shop = db.shop.filter(x => !x.done); save(); renderStock(); };
}

// ---------- v0.19 購買紀錄：幾號買進來、幾號用完 ----------
const openBuys = s => (s.buys || []).filter(b => !b.end);
const dayDiff = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const mdd = d => { const x = parseYmd(d); return `${x.getMonth() + 1}/${x.getDate()}`; };
function avgDays(s) { const f = (s.buys || []).filter(b => b.end); return f.length ? Math.round(f.reduce((t, b) => t + dayDiff(b.date, b.end), 0) / f.length) : null; }
function renderBuyLog() {
  const all = db.stock.flatMap(s => (s.buys || []).map(b => ({ s, b }))).sort((x, y) => x.b.date < y.b.date ? 1 : -1);
  const today = ymd(new Date());
  const avgs = db.stock.map(s => [s, avgDays(s)]).filter(([, a]) => a !== null);
  const row = ({ s, b }) => `<button class="blog" data-item="${s.id}" data-buy="${b.id}"><span class="si">${s.icon}</span>
    <span class="bm"><b>${esc(s.name)} <small>×${fmtQty(b.qty)} ${esc(s.unit)}</small></b>
    <small>${mdd(b.date)} 買進來 → ${b.end ? `${mdd(b.end)} 用完` : '還在用'}</small></span>
    <em class="${b.end ? '' : 'using'}">${b.end ? dayDiff(b.date, b.end) + ' 天' : '已 ' + dayDiff(b.date, today) + ' 天'}</em></button>`;
  $('#log-list').innerHTML =
    (avgs.length ? `<div class="sec">平均多久用完</div><div class="avgs">${avgs.map(([s, a]) => `<span>${s.icon} ${esc(s.name)} <b>${a} 天</b></span>`).join('')}</div>` : '') +
    `<div class="sec">購買紀錄（${all.length}）</div>` + (all.map(row).join('') || '<p class="empty">還沒有紀錄。在採買清單或「需要補貨」按「買了」，就會記下購入日期；用到 0 會自動記用完。也可以按下面自己加。</p>') +
    `<div class="btns"><button class="primary" id="blog-add">＋ 記一筆購買</button></div>`;
  $('#blog-add').onclick = () => editBuy(null, null);
  $('#log-list').querySelectorAll('.blog').forEach(el => el.onclick = () => { const s = db.stock.find(z => z.id === el.dataset.item); editBuy(s, s.buys.find(b => b.id === el.dataset.buy)); });
}
function editBuy(s, b) {
  const isNew = !b, v = b || { date: ymd(new Date()), qty: 1, end: '' };
  if (!db.stock.length) return toast('先在庫存新增用品');
  openSheet(`<h3>${isNew ? '記一筆購買' : `${s.icon} ${esc(s.name)}`}</h3>
    ${isNew ? `<label>買了什麼</label><select id="u-item">${db.stock.map(z => `<option value="${z.id}">${z.icon} ${esc(z.name)}</option>`).join('')}</select>` : ''}
    <div class="row2"><div><label>購入日期</label><input id="u-date" type="date" value="${v.date}"></div><div><label>數量</label><input id="u-qty" type="number" inputmode="decimal" min="0" step="any" value="${v.qty}"></div></div>
    <label>用完日期（還在用就空白）</label><input id="u-end" type="date" value="${v.end}">
    <div class="btns"><button id="u-today">今天用完了</button></div>
    ${isNew ? '<label class="chk"><input type="checkbox" id="u-add" checked> 同時加到庫存數量</label>' : ''}
    <p class="err" id="u-err"></p>
    <div class="btns"><button class="primary" id="u-save">儲存</button>${isNew ? '' : '<button class="danger" id="u-del">刪除這筆紀錄</button>'}<button id="u-cancel">取消</button></div>`);
  $('#u-today').onclick = () => { $('#u-end').value = ymd(new Date()); };
  $('#u-cancel').onclick = closeSheet;
  $('#u-save').onclick = () => {
    const item = isNew ? db.stock.find(z => z.id === $('#u-item').value) : s;
    const date = $('#u-date').value, end = $('#u-end').value, qty = parseFloat($('#u-qty').value);
    if (!date) return $('#u-err').textContent = '請選購入日期';
    if (!(qty > 0)) return $('#u-err').textContent = '數量請填數字';
    if (end && end < date) return $('#u-err').textContent = '用完日期不能比購入日期早';
    if (isNew) { (item.buys = item.buys || []).push({ id: uid(), date, qty, end }); if ($('#u-add').checked && !end) item.qty = fmtQty(item.qty + qty); }
    else Object.assign(b, { date, qty, end });
    save(); closeSheet(); renderStock(); toast('已儲存');
  };
  if (!isNew) $('#u-del').onclick = () => { s.buys = s.buys.filter(z => z !== b); save(); closeSheet(); renderStock(); toast('已刪除'); };
}

function openStock(s) {
  const isNew = !s;
  const v = s || { name: '', icon: '📦', qty: 1, unit: '個', low: 1, zone: zoneOf(selZone) ? selZone : '' };
  let zsel = zoneOf(v.zone) ? v.zone : '';
  openSheet(`
    <h3>${isNew ? '新增用品' : '修改用品'}</h3>
    <label>名稱</label><input id="s-name" value="${esc(v.name)}" placeholder="例如：沐浴乳">
    <label>放在哪裡</label><div class="zpick">${db.zones.map(z => `<button type="button" data-z="${z.id}" class="${z.id === zsel ? 'on' : ''}">${z.icon} ${esc(z.name)}</button>`).join('')}<button type="button" data-z="" class="${zsel ? '' : 'on'}">不分區</button></div>
    <label>圖示</label><div class="icongrid">${ICONS.map(i => `<button type="button" class="${i === v.icon ? 'on' : ''}">${i}</button>`).join('')}</div>
    <div class="row2"><div><label>現在有幾個</label><input id="s-qty" type="number" inputmode="decimal" min="0" step="any" value="${v.qty}"></div>
      <div><label>單位</label><input id="s-unit" value="${esc(v.unit)}" placeholder="瓶、包、顆"></div></div>
    ${s && (s.buys || []).length ? `<p class="hint">最近一次 ${mdd(s.buys.slice().sort((a, b) => a.date < b.date ? 1 : -1)[0].date)} 買${avgDays(s) !== null ? `・平均 ${avgDays(s)} 天用完` : ''}（看全部：購買紀錄）</p>` : ''}
    <label>剩幾個以下要提醒補貨？</label><input id="s-low" type="number" inputmode="decimal" min="0" step="any" value="${v.low}">
    <p class="err" id="s-err"></p>
    <div class="btns"><button class="primary" id="s-save">儲存</button>
      ${isNew ? '' : '<button class="danger" id="s-del">刪除</button>'}<button id="s-cancel">取消</button></div>`);
  if (isNew) setTimeout(() => $('#s-name').focus(), 50);
  $('#sheet .icongrid').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    $('#sheet .icongrid').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); };
  $('#sheet .zpick').onclick = e => { const b = e.target.closest('button'); if (!b) return; zsel = b.dataset.z;
    $('#sheet .zpick').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#s-cancel').onclick = closeSheet;
  $('#s-save').onclick = () => {
    const name = $('#s-name').value.trim(), qty = parseFloat($('#s-qty').value), low = parseFloat($('#s-low').value);
    if (!name) return $('#s-err').textContent = '請寫名稱';
    if (!(qty >= 0) || !(low >= 0)) return $('#s-err').textContent = '數量請填數字';
    const data = { name, icon: $('#sheet .icongrid .on').textContent, qty, unit: $('#s-unit').value.trim() || '個', low, zone: zsel };
    if (isNew) db.stock.push({ id: uid(), ...data }); else Object.assign(s, data);
    save(); closeSheet(); renderStock(); toast('已儲存');
  };
  if (!isNew) $('#s-del').onclick = () => { db.stock = db.stock.filter(z => z !== s); save(); closeSheet(); renderStock(); toast('已刪除'); };
}

function buyStock(s) {   // 採買清單勾選庫存品 → 問買了幾個，加回庫存
  const suggest = Math.max(1, Math.ceil(s.low * 2 - s.qty));
  openSheet(`<h3>${s.icon} ${esc(s.name)} 買了幾${esc(s.unit)}？</h3>
    <input id="b-n" type="number" inputmode="decimal" min="0" step="any" value="${suggest}" class="big">
    <label>購入日期</label><input id="b-date" type="date" value="${ymd(new Date())}">
    <p class="hint">會加到庫存裡（現在剩 ${fmtQty(s.qty)} ${esc(s.unit)}）</p>
    <div class="btns"><button class="primary" id="b-ok">買好了</button><button id="b-no">取消</button></div>`);
  $('#b-no').onclick = closeSheet;
  $('#b-ok').onclick = () => { const n = parseFloat($('#b-n').value) || 0; s.qty = fmtQty(s.qty + n);
    if (n > 0) (s.buys = s.buys || []).push({ id: uid(), date: $('#b-date').value || ymd(new Date()), qty: n, end: '' });
    save(); closeSheet(); renderStock(); toast('已補貨，記在購買紀錄'); };
}

function bindStock() {
  document.querySelectorAll('.stabs button').forEach(b => b.onclick = () => { stockTab = b.dataset.tab; renderStock(); });
  $('#stock-add').onclick = () => openStock(null);
  $('#house').addEventListener('click', e => { const b = e.target.closest('.zb'); if (!b) return;
    selZone = selZone === b.dataset.zone ? '' : b.dataset.zone; renderStock(); });
  $('#zchips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'zone-edit') return openZones();
    selZone = b.dataset.z; renderStock(); });
  $('#stock-list').onclick = e => {
    const r = e.target.closest('.srow'); if (!r) return;
    const s = db.stock.find(x => x.id === r.dataset.id); if (!s) return;
    if (e.target.closest('[data-buy]')) return buyStock(s);
    const pm = e.target.closest('[data-d]');
    if (pm) {
      s.qty = Math.max(0, fmtQty(s.qty + Number(pm.dataset.d)));
      if (s.qty === 0 && openBuys(s).length) { openBuys(s).forEach(b => b.end = ymd(new Date())); toast(`${s.name} 用完了，已記在購買紀錄`); }
      save(); renderStock(); return;
    }
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

buildHours(); bind(); bindMove(); bindMonth(); bindStock(); render(); scrollToNow();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
