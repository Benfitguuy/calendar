'use strict';
// 我們的行事曆（Sarah & Ben）— 試用版：資料只存在這支手機（localStorage）
// 之後接雲端同步時，只要換掉 Store 這一段。
const APP_VERSION = '0.10.0';
const NO_END_MINS = 30;                // 沒有結束時間的行程，時間軸上畫 30 分鐘高
const HOUR = 60;                       // 每小時高度（px），要跟 style.css 的 --hour 一致
const NAMES = { ben: '<img class="av" src="icons/boy.svg" alt="">Ben', sarah: '<img class="av" src="icons/girl.svg" alt="">Sarah', both: '♥ 一起', work: '💼 公事' };
const OWNERS = ['ben', 'sarah', 'both', 'work'];
const isShared = o => o === 'both' || o === 'work';   // 橫跨兩欄的行程
const REPEAT = { none: '不重複', daily: '每天', weekdays: '平日（週一到五）', weekly: '每週同一天' };
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
    ? db.todos.map(t => `<div class="chip ${t.owner}" data-id="${t.id}">${esc(t.title)}${t.mins ? `<small>${durLabel(t.mins)}</small>` : ''}</div>`).join('')
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
    <select id="f-repeat">${Object.entries(REPEAT).map(([k, t]) => `<option value="${k}"${k === v.repeat ? ' selected' : ''}>${t}</option>`).join('')}</select>
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
    const mins = e.end ? Math.max(15, toMin(e.end) - toMin(e.start)) : 0;
    db.todos.push({ id: uid(), title: e.title, owner: e.owner, mins, note: e.note || '' });
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
  // 跟「新增行程」同一個樣子；日期和開始時間可以不填（不填＝留在待安排）
  const isNew = !t;
  const v = t || { title: '', owner: 'sarah', mins: 60, note: '' };
  const opts = [0, 15, 30, 60, 90, 120, 180];
  if (!opts.includes(v.mins)) opts.push(v.mins), opts.sort((a, b) => a - b);
  openSheet(`
    <h3>${isNew ? '新增待安排' : '編輯待安排'}</h3>
    <label>要做什麼？</label><input id="t-title" value="${esc(v.title)}" placeholder="例如：寄包裹">
    <label>是誰的？</label>${segHtml(v.owner)}
    <label>日期 <span class="opt-tag">還沒決定可以不填</span></label><input id="t-date" type="date" value="">
    <div class="row2">
      <div><label>開始 <span class="opt-tag">可不填</span></label><input id="t-start" type="time" step="300" value=""></div>
      <div><label>大概要多久</label>
        <select id="t-mins">${opts.map(m => `<option value="${m}"${m === v.mins ? ' selected' : ''}>${m ? durLabel(m) : '無'}</option>`).join('')}</select></div>
    </div>
    <label>備註</label><input id="t-note" value="${esc(v.note || '')}" placeholder="例如：郵局 5 點關門">
    <p class="hint">日期和開始時間都填了，就會直接排進行事曆；沒填就留在下面的「待安排」，之後再拖進去。</p>
    <p class="err" id="t-err"></p>
    <div class="btns">
      <button class="primary" id="t-save">儲存</button>
      ${isNew ? '' : '<button class="danger" id="t-del">刪除</button>'}
      <button id="t-cancel">取消</button>
    </div>`);
  bindSeg();
  if (isNew) setTimeout(() => $('#t-title').focus(), 50);
  $('#sheet').querySelectorAll('input').forEach(i => i.addEventListener('input', () => $('#t-err').textContent = ''));
  $('#t-cancel').onclick = closeSheet;
  $('#t-save').onclick = () => {
    const title = $('#t-title').value.trim(), date = $('#t-date').value, start = $('#t-start').value;
    if (!title) return $('#t-err').textContent = '請先寫要做什麼';
    if (!!date !== !!start) return $('#t-err').textContent = '日期和開始時間要一起填，或都不填';
    const data = { title, owner: segValue(), mins: Number($('#t-mins').value), note: $('#t-note').value.trim() };
    if (date) {                                        // 直接排進行事曆
      const s0 = toMin(start);
      if (data.mins && s0 + data.mins > 1439) return $('#t-err').textContent = '超過半夜 12 點了，請改短一點';
      db.events.push({ id: uid(), title, owner: data.owner, date, start, end: data.mins ? toTime(s0 + data.mins) : '',
        repeat: 'none', ex: [], note: data.note });
      if (!isNew) db.todos = db.todos.filter(x => x !== t);
      save(); closeSheet(); sel = date; render(); toast(`已排進 ${md(date)} ${start}`);
      return;
    }
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
  const mins = drag.t.mins || NO_END_MINS;
  let start = Math.round(((drag.y - br.top) / HOUR * 60 - 15) / 15) * 15;
  start = Math.max(0, Math.min(1440 - mins, start));
  drag.drop = start;
  const o = drag.t.owner, left = o === 'sarah' ? 50 : 0, width = isShared(o) ? 100 : 50;
  if (pv.parentNode !== box) box.appendChild(pv);
  pv.hidden = false;
  pv.className = '';
  pv.style.cssText = `top:${start / 60 * HOUR}px;height:${Math.max(24, mins / 60 * HOUR)}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px);border-color:var(--${o}-bd);color:var(--${o}-fg)`;
  pv.textContent = drag.t.mins ? `${toTime(start)}–${toTime(start + mins)}` : toTime(start);
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
    start: toTime(d.drop), end: d.t.mins ? toTime(Math.min(1439, d.drop + d.t.mins)) : '', repeat: 'none', ex: [], note: d.t.note || '' });
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
function openDay(day) {
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
  if ($('#p-start')) $('#p-start').onclick = () => {
    pv.periods.filter(x => !x.end && x.start < day).forEach(x => {   // 上一次忘了按結束 → 自動補上
      const e1 = addDays(x.start, st.avgLen - 1), e2 = addDays(day, -1); x.end = e1 < e2 ? e1 : e2;
    });
    pv.periods.push({ start: day, end: null });
    savePv(); renderMonth(); openDay(day); toast('已記錄經期開始');
  };
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
  if ($('#p-end')) $('#p-end').onclick = () => { p.end = day; savePv(); renderMonth(); openDay(day); toast('已記錄經期結束'); };
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
// ====================================================================
const CATS = [['food', '🍜', '餐飲'], ['grocery', '🛒', '買菜'], ['transport', '🚗', '交通'], ['home', '🏠', '居家'],
  ['shopping', '🛍️', '購物'], ['fun', '🎉', '娛樂'], ['health', '💊', '醫療'], ['bills', '🧾', '帳單'], ['other', '📦', '其他']];
const CAT = Object.fromEntries(CATS.map(([k, i, n]) => [k, { icon: i, name: n }]));
const PAYER = { ben: 'Ben 付', sarah: 'Sarah 付', both: '一起付' };
const money = n => '$' + (Math.round(n * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
let moneyMonth = ymd(new Date()).slice(0, 7);

function renderMoney() {
  const [y, m] = moneyMonth.split('-').map(Number);
  $('#money-title').textContent = `${y}年${m}月`;
  const list = db.expenses.filter(x => x.date.slice(0, 7) === moneyMonth)
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.t || 0) - (a.t || 0));
  const total = list.reduce((s, x) => s + x.amount, 0);
  const byP = { ben: 0, sarah: 0, both: 0 }; list.forEach(x => byP[x.payer] += x.amount);
  const byC = {}; list.forEach(x => byC[x.cat] = (byC[x.cat] || 0) + x.amount);
  const cats = Object.entries(byC).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;
  $('#money-sum').innerHTML = `
    <div class="sum-top"><span>這個月總共花了</span><b>${money(total)}</b></div>
    <div class="sum-p">
      <span class="ben"><img class="av" src="icons/boy.svg" alt="">${money(byP.ben)}</span>
      <span class="sarah"><img class="av" src="icons/girl.svg" alt="">${money(byP.sarah)}</span>
      <span class="both">♥ 一起 ${money(byP.both)}</span>
    </div>
    ${cats.map(([k, v]) => `<div class="cbar"><span>${CAT[k].icon} ${CAT[k].name}</span>
      <i style="width:${Math.max(4, v / max * 100)}%"></i><b>${money(v)}</b></div>`).join('')}`;
  let h = '', last = '';
  for (const x of list) {
    if (x.date !== last) { last = x.date; const d = parseYmd(x.date); h += `<div class="mday-h">${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）</div>`; }
    h += `<button class="xrow" data-id="${x.id}"><span class="ci">${CAT[x.cat].icon}</span>
      <span class="xt">${esc(x.note || CAT[x.cat].name)}<small class="${x.payer}">${PAYER[x.payer]}</small></span><b>${money(x.amount)}</b></button>`;
  }
  $('#money-list').innerHTML = h || '<p class="empty">這個月還沒有記帳，按右上角「＋」記第一筆吧</p>';
}

function openExpense(x) {
  const isNew = !x;
  const v = x || { amount: '', cat: 'food', payer: 'sarah', date: ymd(new Date()), note: '' };
  openSheet(`
    <h3>${isNew ? '記一筆' : '修改這筆'}</h3>
    <label>多少錢？</label><input id="x-amt" type="number" inputmode="decimal" step="0.01" min="0" value="${v.amount}" placeholder="0" class="big">
    <label>類別</label>
    <div class="catgrid">${CATS.map(([k, i, n]) => `<button type="button" data-cat="${k}" class="${k === v.cat ? 'on' : ''}">${i}<span>${n}</span></button>`).join('')}</div>
    <label>誰付的？</label>
    <div class="seg seg3">${['ben', 'sarah', 'both'].map(o => `<button type="button" class="${o}${o === v.payer ? ' on' : ''}" data-owner="${o}">${NAMES[o]}</button>`).join('')}</div>
    <label>日期</label><input id="x-date" type="date" value="${v.date}">
    <label>備註（可以不填）</label><input id="x-note" value="${esc(v.note || '')}" placeholder="例如：超市、和朋友吃飯">
    <p class="err" id="x-err"></p>
    <div class="btns"><button class="primary" id="x-save">儲存</button>
      ${isNew ? '' : '<button class="danger" id="x-del">刪除</button>'}<button id="x-cancel">取消</button></div>`);
  bindSeg();
  if (isNew) setTimeout(() => $('#x-amt').focus(), 50);
  $('#sheet .catgrid').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    $('#sheet .catgrid').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); };
  $('#x-amt').oninput = () => $('#x-err').textContent = '';
  $('#x-cancel').onclick = closeSheet;
  $('#x-save').onclick = () => {
    const amount = Math.round(parseFloat($('#x-amt').value) * 100) / 100;
    if (!(amount > 0)) return $('#x-err').textContent = '請輸入金額';
    if (!$('#x-date').value) return $('#x-err').textContent = '請選日期';
    const data = { amount, cat: $('#sheet .catgrid .on').dataset.cat, payer: segValue(), date: $('#x-date').value, note: $('#x-note').value.trim() };
    if (isNew) db.expenses.push({ id: uid(), t: Date.now(), ...data }); else Object.assign(x, data);
    save(); closeSheet(); moneyMonth = data.date.slice(0, 7); renderMoney(); toast('記好了');
  };
  if (!isNew) $('#x-del').onclick = () => {
    $('#x-del').outerHTML = '<button class="danger" id="x-del2">確定刪除</button>';
    $('#x-del2').onclick = () => { db.expenses = db.expenses.filter(z => z !== x); save(); closeSheet(); renderMoney(); toast('已刪除'); };
  };
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
  $('#money-list').onclick = e => { const b = e.target.closest('.xrow'); if (b) openExpense(db.expenses.find(x => x.id === b.dataset.id)); };
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
