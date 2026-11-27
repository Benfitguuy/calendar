'use strict';
// 我們的行事曆（Sarah & Ben）— 試用版：資料只存在這支手機（localStorage）
// 之後接雲端同步時，只要換掉 Store 這一段。
const APP_VERSION = '0.3.0';
const HOUR = 60;                       // 每小時高度（px），要跟 style.css 的 --hour 一致
const NAMES = { ben: '👦 Ben', sarah: '👧 Sarah', both: '♥ 一起', work: '💼 公事' };
const OWNERS = ['ben', 'sarah', 'both', 'work'];
const isShared = o => o === 'both' || o === 'work';   // 橫跨兩欄的行程
const REPEAT = { none: '不重複', daily: '每天', weekdays: '平日（週一到五）', weekly: '每週同一天' };
const WEEK = '日一二三四五六';

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
const save = () => Store.save(db);
let sel = ymd(new Date());

function occursOn(e, day) {
  if (day < e.date || (e.ex || []).includes(day)) return false;
  const dow = parseYmd(day).getDay();
  switch (e.repeat) {
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekly': return dow === parseYmd(e.date).getDay();
    default: return day === e.date;
  }
}

// ---------- 畫面 ----------
function render() { renderHeader(); renderEvents(); renderTray(); }

function renderHeader() {
  const d = parseYmd(sel);
  $('#month').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月`;
  const sun = addDays(sel, -d.getDay()), today = ymd(new Date());
  let h = '';
  for (let i = 0; i < 7; i++) {
    const day = addDays(sun, i);
    h += `<button class="day${day === sel ? ' sel' : ''}${day === today ? ' today' : ''}" data-day="${day}">
      <span class="w">${WEEK[i]}</span><span class="n">${parseYmd(day).getDate()}</span></button>`;
  }
  $('#days').innerHTML = h;
}

function buildHours() {
  let h = '';
  for (let i = 0; i <= 24; i++) h += `<div class="hr" style="top:${i * HOUR}px"><span>${pad(i % 24)}:00</span></div>`;
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
    const s = toMin(e.start), e2 = Math.max(toMin(e.end), s + 15);
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
      <b>${icon}${esc(it.ev.title)}</b>${ht >= 36 ? `<small>${it.ev.start}–${it.ev.end}${it.ev.repeat !== 'none' ? ' · ↻' + REPEAT[it.ev.repeat] : ''}</small>` : ''}</div>`;
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
    ? db.todos.map(t => `<div class="chip ${t.owner}" data-id="${t.id}">${esc(t.title)}<small>${durLabel(t.mins)}</small></div>`).join('')
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
    end: preset.end || '10:00', repeat: 'none' };
  const rep = v.repeat !== 'none';
  openSheet(`
    <h3>${isNew ? '新增行程' : '編輯行程'}</h3>
    <label>要做什麼？</label><input id="f-title" value="${esc(v.title)}" placeholder="例如：看牙醫">
    <label>是誰的？</label>${segHtml(v.owner)}
    <label>${rep ? '從哪一天開始' : '日期'}</label><input id="f-date" type="date" value="${v.date}">
    <div class="row2">
      <div><label>開始</label><input id="f-start" type="time" step="300" value="${v.start}"></div>
      <div><label>結束</label><input id="f-end" type="time" step="300" value="${v.end}"></div>
    </div>
    <label>重複</label>
    <select id="f-repeat">${Object.entries(REPEAT).map(([k, t]) => `<option value="${k}"${k === v.repeat ? ' selected' : ''}>${t}</option>`).join('')}</select>
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
  $('#f-cancel').onclick = closeSheet;
  $('#f-save').onclick = () => {
    const title = $('#f-title').value.trim(), start = $('#f-start').value, end = $('#f-end').value, date = $('#f-date').value;
    if (!title) return $('#f-err').textContent = '請先寫要做什麼';
    if (!date || !start || !end) return $('#f-err').textContent = '日期和時間都要填';
    if (toMin(end) <= toMin(start)) return $('#f-err').textContent = '結束時間要比開始晚';
    const data = { title, owner: segValue(), date, start, end, repeat: $('#f-repeat').value };
    if (isNew) db.events.push({ id: uid(), ex: [], ...data }); else Object.assign(e, data);
    save(); closeSheet(); renderEvents(); toast('已儲存');
  };
  if (isNew) return;
  $('#f-back').onclick = () => {
    const mins = Math.max(15, toMin(e.end) - toMin(e.start));
    db.todos.push({ id: uid(), title: e.title, owner: e.owner, mins });
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
  const isNew = !t;
  const v = t || { title: '', owner: 'sarah', mins: 60 };
  const opts = [15, 30, 45, 60, 90, 120, 180];
  if (!opts.includes(v.mins)) opts.push(v.mins), opts.sort((a, b) => a - b);
  openSheet(`
    <h3>${isNew ? '新增待安排' : '編輯待安排'}</h3>
    <label>要做什麼？</label><input id="t-title" value="${esc(v.title)}" placeholder="例如：寄包裹">
    <label>是誰的？</label>${segHtml(v.owner)}
    <label>大概要多久？</label>
    <select id="t-mins">${opts.map(m => `<option value="${m}"${m === v.mins ? ' selected' : ''}>${durLabel(m)}</option>`).join('')}</select>
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
    const data = { title, owner: segValue(), mins: Number($('#t-mins').value) };
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
  const mins = drag.t.mins;
  let start = Math.round(((drag.y - br.top) / HOUR * 60 - 15) / 15) * 15;
  start = Math.max(0, Math.min(1440 - mins, start));
  drag.drop = start;
  const o = drag.t.owner, left = o === 'sarah' ? 50 : 0, width = isShared(o) ? 100 : 50;
  if (pv.parentNode !== box) box.appendChild(pv);
  pv.hidden = false;
  pv.className = '';
  pv.style.cssText = `top:${start / 60 * HOUR}px;height:${Math.max(24, mins / 60 * HOUR)}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px);border-color:var(--${o}-bd);color:var(--${o}-fg)`;
  pv.textContent = `${toTime(start)}–${toTime(start + mins)}`;
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
    start: toTime(d.drop), end: toTime(Math.min(1439, d.drop + d.t.mins)), repeat: 'none', ex: [] });
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
    openEvent(null, { owner, start: toTime(s), end: toTime(Math.min(1439, s + 60)) });
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
    s0: toMin(e.start), dur: Math.max(15, toMin(e.end) - toMin(e.start)), newStart: null,
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
  mv.label.textContent = `${toTime(s)}–${toTime(Math.min(1439, s + mv.dur))}`;
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
  const s = m.newStart, start = toTime(s), end = toTime(Math.min(1439, s + m.dur)), e = m.e;
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

buildHours(); bind(); bindMove(); render(); scrollToNow();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
