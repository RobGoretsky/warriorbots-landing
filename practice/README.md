# Robotics Practice Scheduler

Doodle-style picker for home practices before the Nov 22 competition: Thu 6 PM, Fri 6 PM or Sun 1 PM, Oct 15 – Nov 20, in the host family's basement. Each family picks itself from the list (no sign-in), taps which adults and kids can make each session, and the page rolls it up. A session is a **go** when the host marks the basement free, at least one adult is coming and at least two kids are coming (three or more shows as the better option). Anyone can **Confirm** or **Call off** a session; the top of the page lists confirmed sessions and the best open options.

Live at `https://warriorbots.ai/practice/` (GitHub Pages, this repo). `noindex`, unlinked from the landing page.

**Why GitHub Pages plus Apps Script:** Pages can't store anything, and claude.ai artifact storage would make every parent sign in. A Google Sheet behind an Apps Script web app is the same backend as the Ramapo scrimmage signup (`claude-workspace/fll/scrimmage-scheduler/`): free, no login for parents, and the sheet doubles as the admin console. Fix a row by hand and that's the truth on the next refresh.

| File | Is |
|---|---|
| `index.html` | the whole UI. With `API_URL` empty it runs in **preview mode** on `localStorage` |
| `Code.gs` | the JSON API: `GET` returns state; `POST {action: saveFamily \| respond \| setStatus}` upserts and returns the new state |

Sheet tabs (created on first use): `Families` (id, name, adults, kids, host), `Responses` (one row per slot × family: who's coming, basement free), `Sessions` (slot status `open` / `confirmed` / `cancelled`). Family names and kids' names live only in the sheet, never in this public repo.

## Deploy (one time, ~3 min)

1. Create a Google Sheet (e.g. "Robotics Practice") → **Extensions → Apps Script**, replace `Code.gs` with this folder's `Code.gs`.
2. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**. Authorize (personal scripts show "hasn't verified this app" → **Advanced → Go to … (unsafe) → Allow**; `@OnlyCurrentDoc` limits it to this one sheet).
3. Paste the `/exec` URL into `API_URL` near the top of the `<script>` in `index.html`, then merge to publish.
4. Add the host family first and tick "Practices are in our basement". Then send `https://warriorbots.ai/practice/` to the other parents.

Redeploy after a `Code.gs` change: **Deploy → Manage deployments → edit → Version: New version**. That keeps the same URL.

## Changing things later

- Dates, days and times: `FIRST_DAY` / `LAST_DAY` / `PRACTICE_DAYS` in `Code.gs` and `FIRST_DAY` / `LAST_DAY` / `TIMES` in `index.html` (keep them in step). Day notes: `NOTES`. Thresholds: `MIN_KIDS`, `GREAT_KIDS`, `MIN_ADULTS`.
- Reset: delete the data rows in the three tabs.
