/** @OnlyCurrentDoc */
/**
 * Robotics practice scheduler — Apps Script JSON API over a Google Sheet.
 *
 * The page (practice/index.html on GitHub Pages) calls this web app with
 * fetch(): GET returns the whole state, POST applies one action and returns
 * the new state. POST bodies are sent as text/plain so the browser makes a
 * "simple" CORS request (no preflight, which Apps Script can't answer).
 *
 * Three tabs, created on first use. The sheet is the admin console: a hand
 * edit is the truth on the next refresh.
 *   Families  — id | name | adults | kids | host | updated_at
 *   Responses — slot | family_id | people | basement | updated_at   (one row per slot × family)
 *   Sessions  — slot | status | updated_at                          (status: open | confirmed | cancelled)
 *
 * Every write is an upsert on a deterministic key (family id = slug of the
 * name; response key = slot + family), so a retried or double-tapped request
 * converges instead of duplicating. A script lock serializes writes.
 */

const FIRST_DAY = '2026-10-15';
const LAST_DAY = '2026-11-20';             // Friday before the Nov 22 competition
const PRACTICE_DAYS = [4, 5, 0];           // Thu, Fri, Sun (getUTCDay)
const STATUSES = ['open', 'confirmed', 'cancelled'];

const TABS = {
  Families: ['id', 'name', 'adults', 'kids', 'host', 'updated_at'],
  Responses: ['slot', 'family_id', 'people', 'basement', 'updated_at'],
  Sessions: ['slot', 'status', 'updated_at'],
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
      if (req.action === 'saveFamily') saveFamily_(req);
      else if (req.action === 'respond') respond_(req);
      else if (req.action === 'setStatus') setStatus_(req);
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

/** Insert or overwrite the row whose first `keyCols` columns match. */
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
const slug_ = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const truthy_ = v => String(v).toUpperCase() === 'TRUE';

function isSlot_(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < FIRST_DAY || date > LAST_DAY) return false;
  return PRACTICE_DAYS.includes(new Date(date + 'T00:00:00Z').getUTCDay());
}

// ---- state + actions ------------------------------------------------------

function state_() {
  return {
    families: read_('Families').map(r => ({
      id: r.id, name: r.name, adults: list_(r.adults), kids: list_(r.kids), host: truthy_(r.host),
    })),
    responses: read_('Responses').map(r => ({
      slot: r.slot, family: r.family_id, people: list_(r.people), basement: truthy_(r.basement),
    })),
    sessions: read_('Sessions').map(r => ({ slot: r.slot, status: r.status || 'open' })),
  };
}

/** Create or edit a family. `id` present = edit (the id never changes, so responses stay attached). */
function saveFamily_(req) {
  const name = String(req.name || '').trim();
  if (!name) throw new Error('Family name is required.');
  const adults = names_(req.adults), kids = names_(req.kids);
  if (!adults.length && !kids.length) throw new Error('Add at least one adult or kid.');
  const families = read_('Families');
  const id = req.id || slug_(name);
  if (!id) throw new Error('Family name needs a letter or number.');
  if (!req.id && families.some(f => f.id === id)) throw new Error('"' + name + '" is already on the list — pick it instead.');
  if (req.host && families.some(f => truthy_(f.host) && f.id !== id)) throw new Error('Another family is already the host.');
  upsert_('Families', [id, name, adults.join(', '), kids.join(', '), !!req.host], 1);
}

/** Who from one family can make one slot (people = names), and for the host, whether the basement is free. */
function respond_(req) {
  if (!isSlot_(req.slot)) throw new Error('No practice slot on ' + req.slot);
  const fam = read_('Families').find(f => f.id === req.family);
  if (!fam) throw new Error('Unknown family: ' + req.family);
  const members = list_(fam.adults).concat(list_(fam.kids));
  const people = names_(req.people).filter(p => members.includes(p));
  upsert_('Responses', [req.slot, fam.id, people.join(', '), truthy_(fam.host) && !!req.basement], 2);
}

function setStatus_(req) {
  if (!isSlot_(req.slot)) throw new Error('No practice slot on ' + req.slot);
  if (!STATUSES.includes(req.status)) throw new Error('Bad status: ' + req.status);
  upsert_('Sessions', [req.slot, req.status], 1);
}
