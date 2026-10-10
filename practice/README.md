# Capybara Warriors Practice Scheduler

Doodle-style picker for the Capybara Warriors (FLL Founders team, Waldwick Warriors Robotics) practices in the Goretsky basement before the Nov 21 qualifier. Rob lists only the days the basement is free. Each family picks itself from a fixed list (no sign-in) and taps which supervising adults and kids can make each session. A session is a **go** with at least one supervising adult and at least two kids (three or more shows as the better option). Only the Goretsky family (`ORGANIZER` in `index.html`) sees **Confirm** / **Call off**; the top of the page lists confirmed sessions, the best open options, and who hasn't answered.

Live at `https://warriorbots.ai/practice/` (GitHub Pages, this repo). `noindex`, unlinked from the landing page. Not a WarriorBots page: it lives here only because this repo is already on GitHub Pages.

**Why GitHub Pages plus Apps Script:** Pages can't store anything, and claude.ai artifact storage would make every parent sign in. A Google Sheet behind an Apps Script web app is the same backend as the Ramapo scrimmage signup (`claude-workspace/fll/scrimmage-scheduler/`): free, no login for parents, and the sheet is the admin console. Fix a row by hand and that's the truth on the next refresh.

| File | Is |
|---|---|
| `index.html` | the whole UI. With `API_URL` empty it runs in **preview mode** on `localStorage` with placeholder families |
| `Code.gs` | the JSON API: `GET` returns state; `POST {action: respond \| setStatus \| addAdult}` upserts and returns the new state |

## The sheet

Tabs are created on the first request. Families and days are typed in by hand; the page can't add or edit them. Names live only in the sheet, never in this public repo.

| Tab | Columns | Who writes it |
|---|---|---|
| `Families` | `id` (short, lowercase), `name`, `adults` (supervisors only, comma separated), `kids`, `may_add_adult` (TRUE lets that family add a supervising parent from the page) | Rob |
| `Slots` | `slot` (YYYY-MM-DD), `time` (e.g. `6:00–7:30 PM`), `kind` (`practice` families answer and anyone can confirm or call off · `regular` standing Saturday practice, families answer · `event` scrimmage etc., shown only · `off` marked no-practice day, shown only; blank = practice), `icon` (an emoji, or `warrior` for the team logo), `note` (e.g. `Giants at Eagles, 1:00 PM`), `status` (blank = open, or `confirmed` / `cancelled`) | Rob adds rows; the page sets `status` |
| `Responses` | `slot`, `family_id`, `people` | the page |

Remove a day by deleting its `Slots` row (any responses for it are then ignored).

## Deploy (one time, ~3 min)

1. Create a Google Sheet (e.g. "Robotics Practice") → **Extensions → Apps Script**, replace `Code.gs` with this folder's `Code.gs`.
2. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**. Authorize (personal scripts show "hasn't verified this app" → **Advanced → Go to … (unsafe) → Allow**; `@OnlyCurrentDoc` limits it to this one sheet).
3. Open the `/exec` URL once so the tabs get created, then fill in `Families` and `Slots`.
4. Paste the `/exec` URL into `API_URL` near the top of the `<script>` in `index.html` and merge to publish.

Redeploy after a `Code.gs` change: **Deploy → Manage deployments → edit → Version: New version**. That keeps the same URL.

## Changing things later

- Thresholds: `MIN_KIDS`, `GREAT_KIDS`, `MIN_ADULTS` in `index.html`. Icons and notes per day: the `Slots` tab.
- Reset answers: delete the data rows in `Responses` and clear `status` in `Slots`.
