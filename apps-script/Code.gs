/**
 * Money Life — Backend v5 (Google Apps Script)
 * ------------------------------------------------------------
 * Google Sheet = ฐานข้อมูลหลัก แอป (PWA) ซิงค์ข้อมูลผ่าน doPost
 *
 *   1) รัน setup() ครั้งแรก → สร้างชีต + API_TOKEN
 *   2) Deploy เป็น Web app → ได้ URL /exec ไปใส่ในแอป
 *   3) (ไม่บังคับ) ANTHROPIC_API_KEY → ใช้ AI ในแอปได้นอก claude.ai
 *   4) (ไม่บังคับ) LINE_TOKEN → บันทึก/สรุป/เตือนผ่าน LINE
 *
 *   อัปเดตจาก v4: วางโค้ดนี้แทนของเดิม แล้วรัน upgradeV5() ครั้งเดียว (ไม่ลบข้อมูลเดิม)
 *
 * Script Properties: API_TOKEN, PAIR_CODE, LINE_TOKEN, LINE_USERS, ANTHROPIC_API_KEY, AI_MODEL
 */

const TZ = 'Asia/Bangkok';
const TX = 'Transactions', DEBTS = 'Debts', GOALS = 'Goals', CAT = 'Categories', SET = 'Settings', REC = 'Recurring', PORT = 'Portfolio', PLANS = 'Plans';
const SCHEMA = {
  Transactions: ['id', 'createdAt', 'date', 'month', 'type', 'bucket', 'category', 'amount', 'note', 'pay', 'card', 'source', 'rec', 'asset'],
  Debts: ['id', 'kind', 'acct', 'name', 'dueDay', 'category', 'balance', 'monthly', 'installments', 'startMonth'],
  Goals: ['id', 'name', 'category', 'autoMonths', 'target', 'initial', 'deadline', 'startMonth'],
  Recurring: ['id', 'name', 'category', 'amount', 'day', 'pay', 'skipped'],
  Portfolio: ['id', 'name', 'kind', 'initial', 'value', 'valueDate'],
  Plans: ['id', 'card', 'name', 'total', 'months', 'monthly', 'startMonth', 'note', 'source', 'createdAt'],
};
const NUM = ['amount', 'balance', 'monthly', 'installments', 'target', 'initial', 'day', 'value', 'total', 'months', 'dueDay', 'autoMonths'];
const MONTHLIKE = ['month', 'startMonth', 'deadline'];
const BUCKETS = { need: 'จำเป็น', card: 'บัตรเครดิต', save: 'ออมฉุกเฉิน', invest: 'ลงทุน' };
// ประเภทบัญชีผ่อน (ตรงกับในแอป): เงื่อนไขแบ่งจ่าย และคำที่ใช้จับใน LINE
const ACCT = {
  credit: { label: 'บัตรเครดิต', terms: [3, 6, 10], min: 1000, kw: [] },
  cashcard: { label: 'บัตรกดเงินสด', terms: [3, 6, 10, 12], min: 0, kw: ['กดเงินสด', 'บัตรกด'] },
  firstchoice: { label: 'บัตรเฟิร์สช้อยส์', terms: [3, 6, 10, 12], min: 0, kw: ['เฟิร์ส', 'first', 'fc'] },
  paylater: { label: 'Shopee PayLater', terms: [1, 3, 6, 12], min: 0, kw: ['shopee', 'ช้อปปี้', 'ชอปปี้', 'paylater'] },
  other: { label: 'บัญชีผ่อนอื่น', terms: [3, 6, 10, 12], min: 0, kw: [] },
};
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

// ต้องตรงกับหมวดในแอป — คอลัมน์ keywords ใช้กับ LINE
const DEFAULT_CATS = [
  ['เงินเดือน', 'income', '', 'เงินเดือน,salary'],
  ['ค่าคอมขาย', 'income', '', 'คอมขาย,ค่าคอม,คอม'],
  ['ค่าคอมซ่อม', 'income', '', 'คอมซ่อม'],
  ['ค่าเดินทาง+เบี้ยเลี้ยง', 'income', '', 'เบี้ยเลี้ยง'],
  ['รายได้อื่น', 'income', '', 'อื่น'],
  ['ค่าอาหาร', 'expense', 'need', 'ข้าว,อาหาร,กิน,กาแฟ,ชา,น้ำ,ขนม,ก๋วยเตี๋ยว,ส้มตำ,มื้อ,หมูกระทะ,ชาบู,เซเว่น,บุฟเฟ่ต์'],
  ['ค่าไฟบ้าน', 'expense', 'need', 'ค่าไฟ,การไฟฟ้า'],
  ['ค่าโทรศัพท์', 'expense', 'need', 'ค่าโทร,โทรศัพท์,เน็ต,มือถือ'],
  ['ค่าเดินทาง', 'expense', 'need', 'น้ำมัน,รถ,bts,mrt,แท็กซี่,grab,วิน,ทางด่วน,จอดรถ'],
  ['ของใช้/ช้อปปิ้ง', 'expense', 'need', 'ของใช้,ช้อป,เสื้อ,lazada,ลาซาด้า,ซื้อของ'],
  ['อื่นๆ', 'expense', 'need', ''],
  ['เก็บเงินฉุกเฉิน', 'expense', 'save', 'ฉุกเฉิน,เก็บเงิน,ออม'],
  ['ซื้อหุ้นปันผล', 'expense', 'invest', 'หุ้น,ปันผล'],
  ['ซื้อกองทุนปันผล', 'expense', 'invest', 'กองทุน,dca'],
  ['พัฒนาตนเอง', 'expense', 'invest', 'พัฒนา,คอร์ส,หนังสือ,เรียน,สัมมนา,อบรม'],
];
// หมวดเก่าจาก v4 ยังเก็บไว้ (รายการเก่าไม่หาย) แต่ล้าง keyword เพื่อไม่ให้ LINE จับไปหมวดเก่า
const LEGACY_CATS = ['ค่าประกันสังคม', 'ค่ากองทุน', 'ค่าเปย์แฟน', 'บัตรกดเงินสด กสิกร', 'ผ่อน เฟิร์สช้อยส์', 'ผ่อน Shopee', 'เก็บออมระยะยาว', 'เก็บพัฒนาตัวเอง', 'ซื้อกองทุน', 'ซื้อหุ้น'];
const DEFAULT_ACCOUNTS = [
  { id: 'kbank', kind: 'card', acct: 'credit', name: 'บัตรเครดิต กสิกร', dueDay: '' },
  { id: 'kcash', kind: 'card', acct: 'cashcard', name: 'บัตรกดเงินสด กสิกร', dueDay: '' },
  { id: 'fchoice', kind: 'card', acct: 'firstchoice', name: 'บัตรเฟิร์สช้อยส์', dueDay: '' },
  { id: 'shopee', kind: 'card', acct: 'paylater', name: 'Shopee PayLater', dueDay: '' },
];
const DEFAULT_SETTINGS = [
  ['ratio_need', 40, 'สัดส่วนก้อนจำเป็น (%)'],
  ['ratio_card', 20, 'สัดส่วนก้อนบัตร (%) ใช้จ่ายค่างวดผ่อนทุกบัตร และยอดค้างเดิม'],
  ['ratio_save', 20, 'สัดส่วนก้อนออมฉุกเฉิน (%)'],
  ['ratio_invest', 20, 'สัดส่วนก้อนลงทุน (%)'],
  ['alert_pct', 90, 'เตือนเมื่อก้อนใดใช้ถึง % นี้'],
  ['base_salary', 20000, 'เงินเดือนฐาน ใช้คำนวณงบต้นเดือน'],
  ['daily_reminder', 'on', 'on/off เตือนทาง LINE ตอน 3 ทุ่มถ้าวันนั้นยังไม่บันทึก'],
];

/* ============================================================
 *  SETUP
 * ============================================================ */
function setup() {
  const ss = ss_();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(SCHEMA).forEach(n => ensureTable_(n, SCHEMA[n]));

  const cat = ensureTable_(CAT, ['name', 'type', 'bucket', 'keywords']);
  if (cat.getLastRow() < 2) cat.getRange(2, 1, DEFAULT_CATS.length, 4).setValues(DEFAULT_CATS);
  const set = ensureTable_(SET, ['key', 'value', 'note']);
  if (set.getLastRow() < 2) set.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);

  const debts = ss.getSheetByName(DEBTS);
  if (debts.getLastRow() < 2) DEFAULT_ACCOUNTS.forEach(a => appendObj_(DEBTS, Object.assign({ balance: 0, monthly: 0, startMonth: thisMonth_() }, a)));
  if (ss.getSheetByName(GOALS).getLastRow() < 2) appendObj_(GOALS, { id: 'g1', name: 'เงินฉุกเฉิน 6 เดือน', category: 'เก็บเงินฉุกเฉิน', autoMonths: 6, target: 0, initial: 0, startMonth: thisMonth_() });
  const p = props_();
  if (!p.getProperty('API_TOKEN')) p.setProperty('API_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  if (!p.getProperty('PAIR_CODE')) p.setProperty('PAIR_CODE', String(Math.floor(100000 + Math.random() * 900000)));
  Logger.log('API_TOKEN (ใส่ในแอป): ' + p.getProperty('API_TOKEN'));
  Logger.log('PAIR_CODE (LINE พิมพ์ "ผูก ' + p.getProperty('PAIR_CODE') + '")');
}

/* อัปเดตจาก v4 → v5 รันครั้งเดียว: เพิ่มชีต Plans/คอลัมน์ใหม่ หมวดใหม่ บัญชีผ่อน และเป้าเงินฉุกเฉิน */
function upgradeV5() {
  const ss = ss_();
  Object.keys(SCHEMA).forEach(n => ensureTable_(n, SCHEMA[n]));
  const cat = ss.getSheetByName(CAT), have = cat.getDataRange().getValues();
  const names = have.map(r => String(r[0]).trim());
  have.forEach((r, i) => { if (i && LEGACY_CATS.indexOf(String(r[0]).trim()) >= 0) cat.getRange(i + 1, 4).setValue(''); });
  DEFAULT_CATS.forEach(c => { const i = names.indexOf(c[0]); if (i < 0) cat.appendRow(c); else if (i > 0) cat.getRange(i + 1, 2, 1, 3).setValues([c.slice(1)]); });
  const dt = table_(DEBTS);
  dt.rows.forEach(x => { if (x.obj.kind === 'card' && !x.obj.acct) upsert_(dt, Object.assign({}, x.obj, { acct: 'credit' })); });
  DEFAULT_ACCOUNTS.forEach(a => { if (!dt.rows.some(x => x.obj.id === a.id)) upsert_(dt, Object.assign({ balance: 0, monthly: 0, startMonth: thisMonth_() }, a)); });
  const gt = table_(GOALS);
  if (!gt.rows.some(x => x.obj.category === 'เก็บเงินฉุกเฉิน')) upsert_(gt, { id: 'g' + Date.now(), name: 'เงินฉุกเฉิน 6 เดือน', category: 'เก็บเงินฉุกเฉิน', autoMonths: 6, target: 0, initial: 0, startMonth: thisMonth_() });
  setSetting_('ratio_card', settings_().ratio_card || 20);
  Logger.log('อัปเดตเป็น v5 แล้ว: ตรวจวันจ่ายบิล (dueDay) ของแต่ละบัตรในชีต Debts และลบบัญชีที่ไม่ใช้ได้');
}

function installTriggers() {
  ScriptApp.getProjectTriggers().filter(t => ['dailyReminder', 'weeklyCheckin', 'recurringReminder'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyReminder').timeBased().everyDays(1).atHour(21).inTimezone(TZ).create();
  ScriptApp.newTrigger('recurringReminder').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
  ScriptApp.newTrigger('weeklyCheckin').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(20).inTimezone(TZ).create();
  Logger.log('ตั้งเตือนแล้ว: 08:00 รายการประจำ, 21:00 ยังไม่บันทึก, วันอาทิตย์ 20:00 สรุปสัปดาห์');
}

/* ============================================================
 *  WEB
 * ============================================================ */
function doGet() { return ContentService.createTextOutput('Money Life API v5 กำลังทำงาน'); }

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (_) { return json_({ ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' }); }
  if (Array.isArray(body.events)) { handleLine_(body.events); return json_({ ok: true }); }
  if (!body.token || body.token !== props_().getProperty('API_TOKEN')) return json_({ ok: false, error: 'โทเคนไม่ถูกต้อง ตรวจสอบ API token ในหน้าตั้งค่า' });
  try { return json_({ ok: true, data: route_(body) }); }
  catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}

function route_(b) {
  switch (b.action) {
    case 'pull': return pull_();
    case 'push': applyOps_(b.ops || [], 'app'); return { applied: (b.ops || []).length };
    case 'ai': return aiProxy_(b.messages, b.max_tokens, b.images);
    default: throw new Error('ไม่รู้จักคำสั่ง ' + b.action);
  }
}

function pull_() {
  const s = settings_();
  return {
    tx: rowsOf_(TX), debts: rowsOf_(DEBTS), goals: rowsOf_(GOALS), recurring: rowsOf_(REC), portfolio: rowsOf_(PORT), plans: rowsOf_(PLANS),
    settings: {
      ratios: { need: Number(s.ratio_need) || 0, card: Number(s.ratio_card) || 0, save: Number(s.ratio_save) || 0, invest: Number(s.ratio_invest) || 0 },
      alertPct: Number(s.alert_pct) || 90, baseSalary: Number(s.base_salary) || 0,
      celebrated: parseJson_(s.celebrated),
    },
    ai: !!props_().getProperty('ANTHROPIC_API_KEY'),
    serverTime: new Date().toISOString(),
  };
}

/* ops: {op:'tx'|'debt'|'goal'|'rec'|'asset'|'plan', data} | {op:'txDel'|...|'planDel', id} | {op:'settings', data} */
function applyOps_(ops, source) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  const touched = {};
  try {
    const T = {}, get = n => T[n] || (T[n] = table_(n));
    const dels = { Transactions: [], Debts: [], Goals: [], Recurring: [], Portfolio: [], Plans: [] };
    const NAME = { tx: TX, debt: DEBTS, goal: GOALS, rec: REC, asset: PORT, plan: PLANS, txDel: TX, debtDel: DEBTS, goalDel: GOALS, recDel: REC, assetDel: PORT, planDel: PLANS };
    ops.forEach(o => {
      if (o.op === 'settings') { writeSettings_(o.data || {}); return; }
      if (/Del$/.test(o.op)) { if (NAME[o.op]) dels[NAME[o.op]].push(String(o.id)); return; }
      if (!NAME[o.op] || !o.data || !o.data.id) return;
      const obj = Object.assign({}, o.data);
      if (o.op === 'tx') {
        obj.source = obj.source || source;
        if (obj.type !== 'income') touched[obj.month] = true;
      }
      if (o.op === 'plan') { obj.source = obj.source || source; obj.createdAt = obj.createdAt || new Date().toISOString(); touched[obj.startMonth] = true; }
      upsert_(get(NAME[o.op]), obj);
    });
    Object.keys(dels).forEach(n => {
      if (!dels[n].length) return;
      const t = table_(n);
      t.rows.filter(x => dels[n].indexOf(x.obj.id) >= 0).map(x => x.row).sort((a, b) => b - a).forEach(r => t.sh.deleteRow(r));
    });
  } finally { lock.releaseLock(); }
  // เตือนเข้า LINE เมื่อก้อนไหนใกล้เต็ม (ถ้าผูก LINE ไว้)
  if (lineUsers_().length) Object.keys(touched).forEach(m => { const s = summary_(snapshot_(), m); ['need', 'card'].forEach(b => checkAlert_(s, b, true)); });
}

/* ============================================================
 *  TABLE HELPERS (อ่าน/เขียนตามชื่อหัวคอลัมน์)
 * ============================================================ */
function ensureTable_(name, head) {
  let sh = ss_().getSheetByName(name);
  if (!sh) { sh = ss_().insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); }
  const have = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  head.forEach(h => { if (have.indexOf(h) < 0) { sh.getRange(1, have.length + 1).setValue(h).setFontWeight('bold'); have.push(h); } });
  have.forEach((h, i) => {                                   // เก็บเป็นข้อความ กันวันที่/รหัสเพี้ยน
    if (NUM.indexOf(h) < 0 && h !== 'value') sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    if (h === 'amount') sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('#,##0.00');
  });
  return sh;
}
function table_(name) {
  let sh = ss_().getSheetByName(name) || ensureTable_(name, SCHEMA[name]);
  let v = sh.getDataRange().getValues();
  if (SCHEMA[name] && SCHEMA[name].some(k => v[0].map(String).indexOf(k) < 0)) { sh = ensureTable_(name, SCHEMA[name]); v = sh.getDataRange().getValues(); }  // new columns after an update
  const h = v[0].map(String);
  return { sh, h, rows: v.slice(1).map((r, i) => ({ row: i + 2, obj: toObj_(h, r) })).filter(x => x.obj.id) };
}
function toObj_(h, r) {
  const o = {};
  h.forEach((k, i) => {
    if (!k) return;
    let v = r[i];
    if (v instanceof Date) v = Utilities.formatDate(v, TZ, MONTHLIKE.indexOf(k) >= 0 ? 'yyyy-MM' : 'yyyy-MM-dd');
    if (NUM.indexOf(k) >= 0) v = Number(v) || 0;
    else v = v === null || v === undefined ? '' : String(v);
    if (v !== '') o[k] = v;
  });
  return o;
}
function upsert_(t, obj) {
  const arr = t.h.map(k => obj[k] === undefined || obj[k] === null ? '' : obj[k]);
  const hit = t.rows.find(x => x.obj.id === String(obj.id));
  if (hit) { t.sh.getRange(hit.row, 1, 1, arr.length).setValues([arr]); hit.obj = obj; }
  else { t.sh.appendRow(arr); t.rows.push({ row: t.sh.getLastRow(), obj }); }
}
function appendObj_(name, obj) { upsert_(table_(name), obj); }
function rowsOf_(name) { return table_(name).rows.map(x => x.obj); }

function settings_() {
  const o = {};
  ss_().getSheetByName(SET).getDataRange().getValues().slice(1).forEach(r => { if (r[0] !== '') o[String(r[0]).trim()] = r[1]; });
  return o;
}
function setSetting_(key, value) {
  const sh = ss_().getSheetByName(SET);
  const keys = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => String(r[0]));
  const i = keys.indexOf(key);
  if (i >= 0) sh.getRange(i + 1, 2).setValue(value); else sh.appendRow([key, value, '']);
}
function writeSettings_(d) {
  if (d.ratios) Object.keys(BUCKETS).forEach(k => { if (d.ratios[k] !== undefined) setSetting_('ratio_' + k, Number(d.ratios[k]) || 0); });
  if (d.alertPct !== undefined) setSetting_('alert_pct', Number(d.alertPct) || 90);
  if (d.baseSalary !== undefined) setSetting_('base_salary', Number(d.baseSalary) || 0);
  if (d.celebrated && typeof d.celebrated === 'object') {          // เรื่องที่ฉลองไปแล้ว (เป้าออม ปิดหนี้ เดือนที่อยู่ในงบ) กันฉลองซ้ำข้ามเครื่อง
    setSetting_('celebrated', JSON.stringify(Object.assign(parseJson_(settings_().celebrated), d.celebrated)));
  }
}
function parseJson_(v) { try { const o = JSON.parse(String(v || '{}')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }

/* ============================================================
 *  BUDGET LOGIC (ตรงกับในแอป)
 * ============================================================ */
function snapshot_() {
  const s = settings_();
  return {
    tx: rowsOf_(TX), debts: rowsOf_(DEBTS), plans: rowsOf_(PLANS), recurring: rowsOf_(REC), cats: categories_(),
    ratios: { need: Number(s.ratio_need) || 0, card: Number(s.ratio_card) || 0, save: Number(s.ratio_save) || 0, invest: Number(s.ratio_invest) || 0 },
    alertPct: Number(s.alert_pct) || 90, baseSalary: Number(s.base_salary) || 0,
  };
}
const sum_ = (l, f) => l.reduce((s, x) => s + (f ? f(x) : x.amount), 0);
const mDiff_ = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
function isCard_(d, id) { return !!id && id !== 'cash' && d.debts.some(x => x.kind === 'card' && x.id === id); }
function acct_(d, id) { return ACCT[(d.debts.find(x => x.id === id) || {}).acct] || ACCT.credit; }
/* รายการผ่อน ณ เดือน m: งวดที่เท่าไร ถึงงวดไหม จบเดือนไหน */
function planAt_(p, m) {
  const n = Number(p.months) || 1, mo = Number(p.monthly) || 0, idx = mDiff_(p.startMonth, m) + 1, end = shiftM_(p.startMonth, n - 1), due = idx >= 1 && idx <= n;
  return { idx, n, due, dueAmt: due ? mo : 0, end, done: m > end, notStarted: idx < 1, leftAmt: (n - Math.max(0, Math.min(n, idx - 1))) * mo };
}
function instDue_(d, card, m) { return sum_(d.plans.filter(p => p.card === card), p => planAt_(p, m).dueAmt); }
/* ยอดรูดใช้เงินก้อนของหมวดนั้น จ่ายบิล: ตัดค่างวดเดือนนั้นก่อน (ก้อนบัตร) → ยอดรูดที่นับแล้ว (ไม่นับซ้ำ) → ยอดค้างเดิม (ก้อนบัตร) */
function cardState_(d) {
  const cards = {}, alloc = {};
  d.debts.filter(x => x.kind === 'card').forEach(x => cards[x.id] = { old: Number(x.balance) || 0, pending: 0, start: x.startMonth || '0000-00', instPaid: {} });
  d.tx.slice().sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt)).forEach(t => {
    if (t.type === 'expense' && cards[t.pay] && t.month >= cards[t.pay].start) cards[t.pay].pending += t.amount;
    if (t.type === 'cardpay' && cards[t.card]) {
      const c = cards[t.card]; let rest = t.amount;
      const inst = Math.min(rest, Math.max(0, instDue_(d, t.card, t.month) - (c.instPaid[t.month] || 0)));
      rest -= inst; c.instPaid[t.month] = (c.instPaid[t.month] || 0) + inst;
      const cover = Math.min(rest, Math.max(0, c.pending)); c.pending -= cover; rest -= cover;
      const debt = Math.min(rest, c.old); c.old -= debt; rest -= debt;
      c.pending -= rest;
      alloc[t.id] = { inst, cover, debt };
    }
  });
  return { cards, alloc };
}
/* บิลของบัญชีเดียวในเดือน m (เดือนปัจจุบัน) */
function cardBill_(d, id, cs, m) {
  const c = cs.cards[id] || { pending: 0, old: 0, instPaid: {} }, acc = d.debts.find(x => x.id === id) || {};
  const inst = instDue_(d, id, m), instPaid = Math.min(inst, c.instPaid[m] || 0), instLeft = Math.max(0, inst - instPaid);
  const swipes = Math.max(0, c.pending), swipesNow = sum_(d.tx.filter(t => t.type === 'expense' && t.pay === id && t.month === m)), swipesPrev = Math.max(0, swipes - swipesNow);
  return { id, name: acc.name || id, dueDay: Number(acc.dueDay) || 0, inst, instLeft, swipesPrev, old: c.old, toPay: instLeft + swipesPrev,
           plans: d.plans.filter(p => p.card === id).map(p => ({ p, a: planAt_(p, m) })).filter(x => x.a.due) };
}
function bucketOfCat_(d, name) { const c = d.cats.find(x => x.name === name); return c ? c.bucket : 'need'; }
function summary_(d, m) {
  const cs = cardState_(d), isCur = m === thisMonth_();
  const txs = d.tx.filter(t => t.month === m);
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const items = [];
  txs.forEach(t => {
    if (t.type === 'expense') items.push({ bucket: t.bucket, amount: t.amount });
    if (t.type === 'cardpay') { const a = cs.alloc[t.id] || { inst: t.amount, debt: 0 }, v = (a.inst || 0) + (a.debt || 0); if (v > 0) items.push({ bucket: 'card', amount: v }); }
  });
  const expense = items.reduce((s, t) => s + t.amount, 0);
  const vars = [1, 2, 3].map(i => d.tx.filter(t => t.month === shiftM_(m, -i) && t.type === 'income')).filter(l => l.length)
    .map(l => l.filter(t => t.category !== 'เงินเดือน').reduce((s, t) => s + t.amount, 0));
  const expected = d.baseSalary + (vars.length ? vars.reduce((a, b) => a + b, 0) / vars.length : 0);
  const base = m < thisMonth_() ? income : Math.max(income, expected);
  const cards = d.debts.filter(x => x.kind === 'card');
  const pend = {   // เงินที่ต้องจ่ายแน่ๆ เดือนนี้: บิลประจำที่ยังไม่จ่าย และค่างวดที่ยังไม่จ่าย
    need: isCur ? sum_(d.recurring.filter(r => bucketOfCat_(d, r.category) === 'need' && String(r.skipped || '').split(',').indexOf(m) < 0 && !d.tx.some(t => t.rec === r.id && t.month === m))) : 0,
    card: isCur ? sum_(cards, c => cardBill_(d, c.id, cs, m).instLeft) : m > thisMonth_() ? sum_(cards, c => instDue_(d, c.id, m)) : 0,
  };
  const buckets = {};
  Object.keys(BUCKETS).forEach(b => {
    const budget = base * (d.ratios[b] || 0) / 100;
    const spent = items.filter(t => t.bucket === b).reduce((s, t) => s + t.amount, 0), pending = pend[b] || 0, committed = spent + pending;
    buckets[b] = { label: BUCKETS[b], ratio: d.ratios[b], budget, spent, pending, committed, remaining: budget - committed, pct: budget > 0 ? committed / budget * 100 : (committed > 0 ? 100 : 0) };
  });
  return { month: m, income, base, expense, left: base - expense - pend.need - pend.card, buckets, alertPct: d.alertPct, cs };
}
function checkAlert_(s, bucket, push) {
  const b = s.buckets[bucket];
  const level = b.pct >= 100 ? 100 : (b.pct >= s.alertPct ? s.alertPct : 0);
  if (!level) return null;
  const key = 'ALERT:' + s.month + ':' + bucket + ':' + level;
  if (props_().getProperty(key)) return null;
  props_().setProperty(key, '1');
  const what = bucket === 'card' ? 'ค่างวดบัตรเดือนนี้' : 'ก้อน' + b.label + ' (รวมบิลที่ต้องจ่าย)';
  const msg = level === 100 ? '🚨 ' + what + ' เกินงบแล้ว ฿' + fmt_(-b.remaining) : '⚠️ ' + what + ' ใช้ ' + Math.round(b.pct) + '% ของงบแล้ว เหลือ ฿' + fmt_(b.remaining);
  if (push) lineUsers_().forEach(u => push_(u, msg));
  return msg;
}

/* ============================================================
 *  AI PROXY (ให้แอปที่อยู่นอก claude.ai ใช้ AI ได้)
 * ============================================================ */
function aiProxy_(messages, maxTokens, images) {
  const key = props_().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY');
  if (!Array.isArray(messages) || !messages.length) throw new Error('ไม่มีข้อความ');
  const model = props_().getProperty('AI_MODEL') || 'claude-haiku-4-5-20251001';
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model, max_tokens: Math.min(Number(maxTokens) || 1500, 4000),
      messages: messages.map((m, i) => {
        const role = m.role === 'assistant' ? 'assistant' : 'user', text = String(m.content).slice(0, 60000);
        if (i !== messages.length - 1 || !Array.isArray(images) || !images.length) return { role, content: text };
        const imgs = images.slice(0, 4).filter(x => x && x.data).map(x => ({ type: 'image', source: { type: 'base64', media_type: x.media_type || 'image/jpeg', data: x.data } }));
        return { role, content: imgs.concat([{ type: 'text', text }]) };
      }) }),
  });
  const j = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200) throw new Error('AI: ' + ((j.error && j.error.message) || res.getResponseCode()));
  return { text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('') };
}

/* ============================================================
 *  LINE (รายการเดียวต่อข้อความในเวอร์ชันนี้)
 * ============================================================ */
const HELP = ['วิธีใช้', '• ข้าว 60 → รายจ่าย (เงินสด)', '• กาแฟ 60 รูดกสิกร → รูดบัตร', '• +คอมขาย 3000 → รายรับ', '• บุฟเฟ่ต์ 2000 รูดกสิกร ผ่อน 3 เดือน → รายการผ่อน', '• มือถือ 12000 บัตรกด 10 เดือน → ผ่อนบัตรกดเงินสด', '• จ่ายบิลกสิกร 2500 → จ่ายบิลบัตร', '• บิล → ดูบิลบัตรเดือนนี้', '• สรุป → ดูยอดเดือนนี้', '• ลบล่าสุด → ลบรายการล่าสุดจาก LINE'].join('\n');

function handleLine_(events) {
  events.forEach(ev => {
    if (ev.type === 'follow') { reply_(ev.replyToken, 'สวัสดีครับ พิมพ์ "ผูก <รหัส 6 หลัก>" เพื่อเชื่อมกับบัญชีของคุณ'); return; }
    if (ev.type !== 'message' || ev.message.type !== 'text') return;
    let text;
    try { text = lineCommand_(ev.source.userId, ev.message.text.trim()); } catch (err) { text = 'บันทึกไม่สำเร็จ: ' + (err.message || err); }
    reply_(ev.replyToken, text);
  });
}
function lineCommand_(uid, text) {
  const pair = text.match(/^ผูก\s*(\d{6})$/);
  if (pair) {
    if (pair[1] !== props_().getProperty('PAIR_CODE')) return 'รหัสไม่ถูกต้อง ดูรหัสได้จาก Log ตอนรัน setup';
    const users = lineUsers_(); if (users.indexOf(uid) < 0) { users.push(uid); props_().setProperty('LINE_USERS', users.join(',')); }
    return 'เชื่อมบัญชีแล้ว ✅\n\n' + HELP;
  }
  if (lineUsers_().indexOf(uid) < 0) return 'ยังไม่ได้เชื่อมบัญชี พิมพ์ "ผูก <รหัส 6 หลัก>" ก่อนครับ';
  if (/^(ช่วย|help|\?)$/i.test(text)) return HELP;
  if (/^(สรุป|เหลือ|ยอด)/.test(text)) return summaryText_(summary_(snapshot_(), thisMonth_()));
  if (/^(ลบล่าสุด|undo)$/i.test(text)) return undoLast_();
  if (/^(บิล|ค่างวด|ผ่อน)$/.test(text)) return billsText_(snapshot_());

  const d = snapshot_();
  const t = parseLine_(text, d);
  if (!t) return 'ไม่เข้าใจข้อความนี้ ลองพิมพ์ เช่น "ข้าว 60" "กาแฟ 60 รูดกสิกร" หรือ "+คอมขาย 3000"';
  if (t.error) return t.error;
  if (t.plan) {
    applyOps_([{ op: 'plan', data: t.plan }], 'line');
    const p = t.plan, s2 = summary_(snapshot_(), p.startMonth), b2 = s2.buckets.card;
    return '📆 ผ่อน ' + p.name + ' ฿' + fmt_(p.total) + '\n' + cardLabel_(d, p.card) + ' ' + p.months + ' เดือน × ฿' + fmt_(p.monthly) + '\nเริ่มบิล ' + mTitle_(p.startMonth) + ' จบ ' + mTitle_(shiftM_(p.startMonth, p.months - 1)) +
      '\nค่างวดรวมเดือนนั้น ฿' + fmt_(b2.committed) + ' / งบบัตร ฿' + fmt_(b2.budget) + (b2.remaining < 0 ? ' 🚨 เกินงบ' : '');
  }
  applyOps_([{ op: 'tx', data: t }], 'line');
  const s = summary_(snapshot_(), t.month);
  let msg;
  if (t.type === 'cardpay') msg = '🧾 จ่ายบิล ' + t.category.replace('จ่ายบิล ', '') + ' ฿' + fmt_(t.amount);
  else msg = (t.type === 'income' ? '💰 รายรับ ' : '🧾 รายจ่าย ') + t.category + ' ฿' + fmt_(t.amount) + (t.pay && t.pay !== 'cash' ? ' (รูดบัตร)' : '');
  const b = t.type === 'income' ? null : (t.type === 'cardpay' ? 'card' : t.bucket);
  if (b) msg += '\nก้อน' + s.buckets[b].label + ' เหลือ ฿' + fmt_(s.buckets[b].remaining);
  return msg;
}
function parseLine_(text, d) {
  let t = text.trim(), type = 'expense';
  if (/^[+＋]/.test(t)) { type = 'income'; t = t.slice(1).trim(); }
  // "ผ่อน 3 เดือน" / "0% 10 เดือน": ดึงจำนวนเดือนออกก่อน จะได้ไม่ถูกอ่านเป็นยอดเงิน
  let months = 0;
  t = t.replace(/(?:ผ่อน|แบ่งจ่าย|แบ่ง)?\s*(?:0\s*%\s*)?(\d{1,2})\s*(?:เดือน|งวด|ด\.)/, (_, n) => { months = Number(n); return ' '; });
  const num = t.match(/(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(k|พัน)?/i);
  if (!num) return null;
  const amount = parseFloat(num[1].replace(/,/g, '') + (num[2] || '')) * (num[3] ? 1000 : 1);
  if (!(amount > 0)) return null;
  const words = (t.slice(0, num.index) + ' ' + t.slice(num.index + num[0].length)).trim();
  const lw = words.toLowerCase();
  const card = findCard_(d, lw, !!months);
  const date = /เมื่อวาน/.test(lw) ? Utilities.formatDate(new Date(Date.now() - 864e5), TZ, 'yyyy-MM-dd') : today_();
  const base = { id: 'L' + Date.now(), createdAt: new Date().toISOString(), date, month: date.slice(0, 7), amount, note: words.slice(0, 80) };
  if (/จ่ายบิล|จ่ายบัตร|ชำระบัตร/.test(lw) && card) return Object.assign(base, { type: 'cardpay', card: card.id, bucket: 'card', category: 'จ่ายบิล ' + card.name });
  if (months && type === 'expense') {
    if (!card) return { error: 'ยังไม่มีบัตรหรือบัญชีผ่อน เพิ่มในแอปก่อนนะครับ' };
    const acc = acct_(d, card.id);
    if (acc.min && amount < acc.min) return { error: acc.label + 'แบ่งจ่ายได้เมื่อยอดตั้งแต่ ฿' + fmt_(acc.min) };
    if (acc.min && acc.terms.indexOf(months) < 0) return { error: acc.label + 'แบ่งจ่ายได้ ' + acc.terms.join(', ') + ' เดือน' };
    const name = words.replace(/รูด\S*|บัตร\S*|ผ่อน|แบ่งจ่าย|เมื่อวาน|%|shopee|ช้อปปี้|ชอปปี้|paylater|เฟิร์ส\S*|first\S*|กสิกร|kbank/gi, ' ').replace(/\s+/g, ' ').trim() || 'รายการผ่อน';
    return { plan: { id: 'pl' + Date.now(), card: card.id, name: name.slice(0, 60), total: amount, months, monthly: Math.ceil(amount / months), startMonth: shiftM_(date.slice(0, 7), 1) } };
  }
  const cats = categories_();
  if (type === 'expense' && /ได้เงิน|เข้า$|^เงินเข้า/.test(lw)) type = 'income';
  const terms = [];
  cats.filter(c => c.type === type).forEach(c => { terms.push({ k: c.name.toLowerCase(), c }); c.keywords.forEach(k => terms.push({ k, c })); });
  terms.sort((a, b) => b.k.length - a.k.length);
  const hit = lw ? terms.find(x => lw.indexOf(x.k) >= 0) : null;
  const cat = hit ? hit.c : cats.find(c => c.name === (type === 'income' ? 'รายได้อื่น' : 'อื่นๆ'));
  if (!cat) return null;
  const o = Object.assign(base, { type, bucket: type === 'income' ? '' : cat.bucket, category: cat.name });
  if (type === 'expense') o.pay = card && /รูด|บัตร|กสิกร|กรุงศรี|kbank|krungsri|เฟิร์ส|first|shopee|ช้อปปี้|paylater/i.test(lw) ? card.id : 'cash';
  return o;
}
/* หาบัตรจากข้อความ: บัญชีที่มีคำเฉพาะ (บัตรกด เฟิร์ส shopee) ก่อน แล้วค่อยชื่อบัตรเครดิต */
function findCard_(d, lw, wantCard) {
  const cards = d.debts.filter(x => x.kind === 'card'), credit = cards.filter(c => (c.acct || 'credit') === 'credit');
  const kw = cards.find(c => c.acct && c.acct !== 'credit' && (ACCT[c.acct] || { kw: [] }).kw.some(w => lw.indexOf(w) >= 0));
  if (kw) return kw;
  const words = c => [c.id.toLowerCase(), c.name.replace('บัตรเครดิต ', '').toLowerCase()].filter(w => w && w.length > 1);
  const named = credit.concat(cards).find(c => words(c).some(w => lw.indexOf(w) >= 0));
  if (named) return named;
  return /รูด|บัตร/.test(lw) || wantCard ? (credit[0] || cards[0] || null) : null;
}
function cardLabel_(d, id) { return (d.debts.find(x => x.id === id) || {}).name || id; }
function mTitle_(m) { const [y, mo] = m.split('-').map(Number); return TH_MONTHS[mo - 1] + ' ' + (y + 543); }
function billsText_(d) {
  const m = thisMonth_(), s = summary_(d, m), cards = d.debts.filter(x => x.kind === 'card');
  const lines = ['💳 บิลบัตร ' + mTitle_(m), 'ค่างวดรวม ฿' + fmt_(s.buckets.card.committed) + ' / งบบัตร ฿' + fmt_(s.buckets.card.budget), ''];
  cards.forEach(c => {
    const b = cardBill_(d, c.id, s.cs, m);
    if (!b.inst && !b.toPay) return;
    lines.push(c.name + (b.dueDay ? ' (วันที่ ' + b.dueDay + ')' : '') + (b.toPay > 0 ? ' ต้องจ่าย ฿' + fmt_(b.toPay) : ' จ่ายครบแล้ว ✅'));
    b.plans.forEach(x => lines.push('  • ' + x.p.name + ' งวด ' + x.a.idx + '/' + x.a.n + ' ฿' + fmt_(x.p.monthly)));
    if (b.swipesPrev) lines.push('  • ยอดรูดเดือนก่อน ฿' + fmt_(b.swipesPrev));
  });
  if (lines.length === 3) lines.push('ยังไม่มีค่างวดหรือบิลที่ต้องจ่ายเดือนนี้');
  return lines.join('\n');
}
function categories_() {
  return ss_().getSheetByName(CAT).getDataRange().getValues().slice(1).filter(r => r[0] !== '')
    .map(r => ({ name: String(r[0]).trim(), type: String(r[1]).trim(), bucket: String(r[2] || '').trim(),
                 keywords: String(r[3] || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean) }));
}
function summaryText_(s) {
  const [y, m] = s.month.split('-').map(Number);
  const B = s.buckets, ok = (b, w) => b.remaining <= 0 ? w + 'ครบ ✅' : b.spent ? w + 'แล้ว ฿' + fmt_(b.spent) + ' (ยังขาด ฿' + fmt_(b.remaining) + ')' : 'ยังไม่' + w + ' ฿' + fmt_(b.budget);
  const lines = ['📊 สรุป ' + TH_MONTHS[m - 1] + ' ' + (y + 543), 'งบเดือนนี้ ฿' + fmt_(s.base) + ' แบ่ง ' + Object.keys(BUCKETS).map(k => B[k].ratio).join('/'), '',
    '🏠 จำเป็น ' + (B.need.remaining < 0 ? 'เกิน ฿' + fmt_(-B.need.remaining) + ' 🚨' : 'ใช้ได้อีก ฿' + fmt_(B.need.remaining)) + (B.need.pending ? ' (กันค่าบิลไว้ ฿' + fmt_(B.need.pending) + ')' : ''),
    '💳 ค่างวดบัตร ฿' + fmt_(B.card.committed) + ' / ฿' + fmt_(B.card.budget) + (B.card.pending ? ' (รอจ่าย ฿' + fmt_(B.card.pending) + ')' : ' ✅'),
    '🛟 ออมฉุกเฉิน ' + ok(B.save, 'โอน'),
    '🌱 ลงทุน/พัฒนาตนเอง ' + ok(B.invest, 'ลงทุน')];
  return lines.join('\n');
}
function undoLast_() {
  const all = rowsOf_(TX).filter(t => t.source === 'line').map(t => ({ t, op: 'txDel', label: t.category + ' ฿' + fmt_(t.amount) }))
    .concat(rowsOf_(PLANS).filter(p => p.source === 'line').map(p => ({ t: p, op: 'planDel', label: 'ผ่อน ' + p.name + ' ฿' + fmt_(p.total) })))
    .sort((a, b) => String(b.t.createdAt).localeCompare(String(a.t.createdAt)));
  if (!all.length) return 'ยังไม่มีรายการจาก LINE ให้ลบ';
  applyOps_([{ op: all[0].op, id: all[0].t.id }], 'line');
  return '🗑 ลบแล้ว: ' + all[0].label;
}
function dailyReminder() {
  if (String(settings_().daily_reminder).toLowerCase() === 'off') return;
  if (rowsOf_(TX).some(t => t.date === today_())) return;
  lineUsers_().forEach(u => push_(u, '📝 วันนี้ยังไม่ได้บันทึกรายการเลย\nพิมพ์ เช่น "ข้าว 60" ได้เลยครับ'));
}
/* 08:00 ทุกวัน: เตือนรายการประจำที่ครบกำหนดวันนี้ */
function recurringReminder() {
  const day = Number(Utilities.formatDate(new Date(), TZ, 'd')), m = thisMonth_();
  const tx = rowsOf_(TX);
  const due = rowsOf_(REC).filter(r => Number(r.day) === day && String(r.skipped || '').split(',').indexOf(m) < 0 && !tx.some(t => t.rec === r.id && t.month === m));
  const lines = due.length ? ['📅 ครบกำหนดวันนี้'].concat(due.map(r => '• ' + r.name + ' ฿' + fmt_(r.amount)), ['กดยืนยันได้ในหน้าแชทของแอป']) : [];
  // บิลบัตร: เตือนล่วงหน้า 3 วัน และวันครบกำหนด ถ้ายังไม่ได้จ่าย
  const d = snapshot_(), cs = cardState_(d);
  d.debts.filter(c => c.kind === 'card' && Number(c.dueDay)).forEach(c => {
    const left = Number(c.dueDay) - day; if (left !== 3 && left !== 0) return;
    const b = cardBill_(d, c.id, cs, m); if (b.toPay <= 0) return;
    lines.push((lines.length ? '' : '') + '💳 ' + c.name + (left ? ' ครบกำหนดอีก 3 วัน' : ' ครบกำหนดวันนี้') + ' ฿' + fmt_(b.toPay) + (b.plans.length ? '\n' + b.plans.map(x => '  • ' + x.p.name + ' งวด ' + x.a.idx + '/' + x.a.n + ' ฿' + fmt_(x.p.monthly)).join('\n') : ''));
  });
  if (!lines.length) return;
  lineUsers_().forEach(u => push_(u, lines.join('\n')));
}
/* วันอาทิตย์ 20:00: สรุปสัปดาห์ (จันทร์–อาทิตย์) */
function weeklyCheckin() {
  const d = snapshot_(), end = today_();
  const start = Utilities.formatDate(new Date(Date.now() - 6 * 864e5), TZ, 'yyyy-MM-dd');
  const FIXED = ['ค่าไฟบ้าน', 'ค่าโทรศัพท์', 'ค่าประกันสังคม', 'ค่ากองทุน'];
  const pick = (a, b) => d.tx.filter(t => t.type === 'expense' && !t.rec && t.date >= a && t.date <= b && FIXED.indexOf(t.category) < 0 && t.bucket === 'need');
  const week = pick(start, end), total = week.reduce((s, t) => s + t.amount, 0);
  const prev = [1, 2, 3, 4].map(i => pick(Utilities.formatDate(new Date(Date.now() - (6 + 7 * i) * 864e5), TZ, 'yyyy-MM-dd'), Utilities.formatDate(new Date(Date.now() - 7 * i * 864e5), TZ, 'yyyy-MM-dd')))
    .filter(l => l.length).map(l => l.reduce((s, t) => s + t.amount, 0));
  const avg = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;
  const byCat = {}; week.forEach(t => byCat[t.category] = (byCat[t.category] || 0) + t.amount);
  const s = summary_(d, thisMonth_());
  const lines = ['📅 สรุปสัปดาห์', 'ใช้จ่ายประจำวัน ฿' + fmt_(total) + (avg ? ' (' + (total > avg ? 'สูง' : 'ต่ำ') + 'กว่าเฉลี่ย ฿' + fmt_(Math.abs(total - avg)) + ')' : '')];
  Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).slice(0, 3).forEach(k => lines.push('• ' + k + ' ฿' + fmt_(byCat[k])));
  const dim = Number(Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), TZ, 'd')), daysLeft = dim - Number(Utilities.formatDate(new Date(), TZ, 'd')) + 1;
  lines.push('', 'ก้อนจำเป็น' + (s.buckets.need.remaining < 0 ? 'เกิน ฿' + fmt_(-s.buckets.need.remaining) : 'เหลือ ฿' + fmt_(s.buckets.need.remaining) + ' ใช้ได้วันละ ฿' + fmt_(s.buckets.need.remaining / daysLeft)),
    'ค่างวดบัตรเดือนนี้ ฿' + fmt_(s.buckets.card.committed) + ' / ฿' + fmt_(s.buckets.card.budget));
  lineUsers_().forEach(u => push_(u, lines.join('\n')));
}
function lineUsers_() { return (props_().getProperty('LINE_USERS') || '').split(',').filter(Boolean); }
function reply_(replyToken, text) { lineCall_('reply', { replyToken, messages: [{ type: 'text', text: text.slice(0, 4900) }] }); }
function push_(to, text) { lineCall_('push', { to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }); }
function lineCall_(kind, payload) {
  const token = props_().getProperty('LINE_TOKEN'); if (!token) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/' + kind, { method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token }, payload: JSON.stringify(payload), muteHttpExceptions: true });
}

/* ============================================================
 *  HELPERS
 * ============================================================ */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function props_() { return PropertiesService.getScriptProperties(); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function thisMonth_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM'); }
function shiftM_(m, d) { let [y, mo] = m.split('-').map(Number); mo += d; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return y + '-' + ('0' + mo).slice(-2); }
function fmt_(n) { return Math.round(n).toLocaleString('en-US'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
