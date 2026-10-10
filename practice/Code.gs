/** @OnlyCurrentDoc */
/**
 * Robotics practice scheduler — Apps Script JSON API over a Google Sheet.
 *
 * The page (practice/index.html on GitHub Pages) calls this web app with
 * fetch(): GET returns the whole state, POST applies one action and returns
 * the new state. POST bodies are sent as text/plain so the browser makes a
 * "simple" CORS request (no preflight, which Apps Script can't answer).
 *
 * Three tabs, created on first use. The sheet is the admin console: Rob
 * types the families and the free days in by hand, and a hand edit is the
 * truth on the next refresh.
 *   Families  — id | name | adults | kids | may_add_adult | updated_at
 *   Slots     — slot | time | status | updated_at       (only days the basement is free; status: open | confirmed | cancelled)
 *   Responses — slot | family_id | people | updated_at  (one row per slot × family)
 *
 * The page can't add or edit families; the only family change it can make is
 * adding a supervising adult to a family whose may_add_adult is TRUE. Every
 * write is an upsert on a deterministic key, so a retried or double-tapped
 * request converges instead of duplicating. A script lock serializes writes.
 */

const STATUSES = ['open', 'confirmed', 'cancelled'];

const TABS = {
  Families: ['id', 'name', 'adults', 'kids', 'may_add_adult', 'updated_at'],
  Slots: ['slot', 'time', 'status', 'updated_at'],
  Responses: ['slot', 'family_id', 'people', 'updated_at'],
};

function doGet() {
  return json_(state_());
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (req.action === 'respond') respond_(req);
      else if (req.action === 'setStatus') setStatus_(req);
      else if (req.action === 'addAdult') addAdult_(req);
      else throw new Error('Unknown action: ' + req.action);
    } finally {
      lock.releaseLock();
    }
    out = state_();
  } catch (err) {
    out = { error: String(err.message || err) };
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- sheet plumbing -------------------------------------------------------

function tab_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(TABS[name]);
    sh.getRange('A:A').setNumberFormat('@');  // keep slots as YYYY-MM-DD text, not dates
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Rows as objects keyed by header, plus their sheet row number. */
function read_(name) {
  const sh = tab_(name);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const cols = TABS[name];
  return sh.getRange(2, 1, n, cols.length).getDisplayValues()
    .map((vals, i) => {
      const r = { row: i + 2 };
      cols.forEach((c, j) => { r[c] = String(vals[j]).trim(); });
      return r;
    })
    .filter(r => r[cols[0]]);
}

/** Write `values` into the row whose first `keyCols` columns match, or append one. Stamps updated_at. */
function upsert_(name, values, keyCols) {
  const sh = tab_(name);
  const cols = TABS[name];
  const hit = read_(name).find(r => cols.slice(0, keyCols).every((c, j) => r[c] === String(values[j])));
  const row = values.concat([new Date()]);
  if (hit) sh.getRange(hit.row, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

const list_ = s => s.split(',').map(x => x.trim()).filter(Boolean);
const names_ = a => (Array.isArray(a) ? a : []).map(x => String(x).replace(/,/g, ' ').trim()).filter(Boolean);
const truthy_ = v => String(v).toUpperCase() === 'TRUE';

function slot_(slot) {
  const s = read_('Slots').find(r => r.slot === String(slot));
  if (!s) throw new Error('No practice on ' + slot);
  return s;
}

function family_(id) {
  const f = read_('Families').find(r => r.id === String(id));
  if (!f) throw new Error('Unknown family: ' + id);
  return f;
}

// ---- state + actions ------------------------------------------------------

function state_() {
  return {
    families: read_('Families').map(r => ({
      id: r.id, name: r.name, adults: list_(r.adults), kids: list_(r.kids), mayAddAdult: truthy_(r.may_add_adult),
    })),
    slots: read_('Slots').map(r => ({ slot: r.slot, time: r.time, status: r.status || 'open' }))
      .sort((a, b) => a.slot.localeCompare(b.slot)),
    responses: read_('Responses').map(r => ({ slot: r.slot, family: r.family_id, people: list_(r.people) })),
  };
}

/** Who from one family can make one session (people = names; anyone not in the family is dropped). */
function respond_(req) {
  slot_(req.slot);
  const fam = family_(req.family);
  const members = list_(fam.adults).concat(list_(fam.kids));
  const people = names_(req.people).filter(p => members.includes(p));
  upsert_('Responses', [req.slot, fam.id, people.join(', ')], 2);
}

function setStatus_(req) {
  const s = slot_(req.slot);
  if (!STATUSES.includes(req.status)) throw new Error('Bad status: ' + req.status);
  upsert_('Slots', [s.slot, s.time, req.status], 1);
}

/** Add a supervising adult to a family that's allowed to (may_add_adult). Adding an existing name is a no-op. */
function addAdult_(req) {
  const fam = family_(req.family);
  if (!truthy_(fam.may_add_adult)) throw new Error(fam.name + ' can\'t add adults here — ask Rob.');
  const name = names_([req.name])[0];
  if (!name) throw new Error('Type a first name.');
  const adults = list_(fam.adults);
  if (adults.concat(list_(fam.kids)).includes(name)) return;
  upsert_('Families', [fam.id, fam.name, adults.concat(name).join(', '), fam.kids, fam.may_add_adult], 1);
}
