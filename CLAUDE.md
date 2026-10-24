# Money Life — notes for Claude Code

Personal Thai income/expense PWA for one user (Got). UI text is Thai; talk to the user in Thai.
Ideas and decisions are made in Claude chat (Project "Upgrade Life"); coding happens here.
A chat handoff arrives as a brief in `docs/handoff/` (see `docs/HANDOFF_TEMPLATE.md`). Read the newest brief before starting.

## Layout
- `index.html` (repo root) — the whole app: one file, inline CSS + JS, no build step. ~3,000 lines. Served by GitHub Pages from the root of `main`, so keep app files at the root.
- `sw.js` — service worker. **Bump `CACHE` every release** or phones keep the old app.
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` at the root; `brand/` holds logo SVG/PNG and the 1024 app icon.
- `apps-script/Code.gs` — Google Apps Script backend (Google Sheet = database, LINE bot, AI proxy, timed reminders).
- `docs/SETUP.md` — install/update guide for the user (Thai). Add a section for every release.
- `docs/v5-money-model.md` — the budgeting rules in the user's words.

## Money model (must stay identical in `index.html` and `Code.gs`)
- Monthly budget base = salary (or base salary until it lands) + average of other income over the previous 3 months that have data. No carryover between months.
- Split 40 / 20 / 20 / 20 → `need` (food, electricity, phone, travel, household) / `card` (instalments) / `save` (emergency fund) / `invest` (dividend stocks, dividend funds, self-development).
- A card swipe paid in full counts in the pocket of its category (food on a card = `need`). The `card` pocket only holds **instalments due that month** + paying down an old balance.
- Instalment plan: `{id, card, name, total, months, monthly, startMonth}`; first instalment is on next month's bill by default. Due when month ∈ [startMonth, startMonth+months−1].
- Bill payment (`cardpay`) allocates: this month's instalments → earlier swipes (already counted, not counted again) → old balance → credit.
- Accounts (`Debts` sheet, `kind: 'card'`, `acct`): `credit` (KBank: 3/6/10 months, min ฿1,000), `cashcard`, `firstchoice`, `paylater` (Shopee), `other`.
- Committed = spent + still-to-pay this month (unpaid recurring bills in `need`, unpaid instalments in `card`).
- Emergency goal: `autoMonths × need budget` (default 6).
- Key client functions (in `index.html`): `summary`, `cardState`, `cardBill`, `planAt`, `instDue`, `goalStatus`, `safeToday`, `localParse`. Server mirrors: `summary_`, `cardState_`, `cardBill_`, `planAt_`, `parseLine_`.

## Data & sync
- localStorage `fl6-db` (migrates fl5/fl4), `fl-cfg` {url, token}, `fl-outbox`.
- `commit(ops)` applies locally, queues, then `syncNow()` push → pull. Ops: `tx, debt, goal, rec, asset, plan, settings` and `*Del`.
- Sheets are read/written by header name (`SCHEMA`, `ensureTable_`, `upsert_`), so new columns are safe to add. Add every new op to `NAME` in `applyOps_` and to `pull_`.
- Schema changes need an `upgradeVn()` function the user runs once; never delete user data.

## Rules
- Never commit secrets: API_TOKEN, LINE token, PAIR_CODE, deployment IDs, Anthropic key all live in Script Properties / the user's phone.
- Keep it one self-contained `index.html`; external scripts only from cdnjs/jsdelivr with pinned versions. Fonts: Poppins + IBM Plex Sans Thai Looped.
- Design: calm white canvas, violet `#6C47C9` + gold `#C9972E`, pastel pockets, illustrations as inline SVG, animations respect `prefers-reduced-motion`, light + dark themes.
- Respect the demo mode (seeded data) and the real mode (Sheet connected); demo must never sync.
- When editing large files, change one function at a time and make sure each anchor matches exactly once.

## Testing
- Headless check: Playwright opens `index.html` (file://), collect `pageerror`, screenshot at 390×844.
- Backend: run `Code.gs` in Node with mocked `SpreadsheetApp`/`PropertiesService`/`UrlFetchApp` (`node tools/mock-server.js` serves a mock backend on :8790 with token `TT`) and exercise `doPost`, `lineCommand_`, `upgradeVn`.
- Check numbers with the demo: salary 20,000 → need 8,000 / card 4,000 / save 4,000 / invest 4,000.

## Release checklist
1. Bump `CACHE` in `sw.js`.
2. If the backend changed: version string in `doGet`, `upgradeVn()` if schema changed.
3. Add an update section to `docs/SETUP.md` (Thai, step by step: paste Code.gs → run upgrade → Deploy → New version; the app updates itself once pushed to `main`).
4. Write a short Thai summary of what changed for the user, plus anything to decide back in chat → `docs/handoff/` reply section.
