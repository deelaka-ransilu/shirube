# Handoff: Shirube v1 rebuild, steps 1 to 5 built, next is Dashboard (step 6 of 6)

## Context
Shirube is a local job-application tracker for job seekers, starting with Sri Lanka. It runs on one laptop: no login, no hosting, no cloud. It will be open source (MIT) later. Stack: plain HTML/JS (ES modules), Node, `node:http`, `node:sqlite`, no npm dependencies. Dee (the user, GitHub handle deelaka-ransilu) builds it in WSL Ubuntu at `/home/kazuri/projects/shirube`, repo `https://github.com/deelaka-ransilu/shirube`. Windows user is `kazuri`; Downloads is `/mnt/c/Users/kazuri/Downloads`; browser is Brave; Node on his machine is v26.13.0 (the sandbox has Node 22).

Earlier chats made 10 mockup screens (design only) and a design system. Dee decided to rebuild the app fresh on a new branch, in small steps, as fast as possible. Claude writes code in its sandbox, tests it (node tests plus a headless-browser run with a screenshot), and gives Dee the changed files. Dee copies them in, runs `npm test`, looks in the browser, then commits.

Dee will paste these 4 design files at the start of the new chat: `base.css`, `tokens.css`, `Shirube design system.md`, `Shirube screens v4.html`. They are the design source of truth.

This chat: Dee uploaded the repo zip (steps 1 to 4) plus the design files. Claude built step 5 (My profile) and delivered 12 files in `/mnt/user-data/outputs/step5/` with one chained cp + `npm test` command. Dee has NOT yet reported running it, looking at it in Brave, or committing it.

## Decisions made

**Working rules with Dee**
- Informal, brief, plain words, step by step, give the reason behind a claim. If a message is typo-heavy, say in one line how it was read, then go ahead.
- Dee is "lazy to do edits": Claude makes the changes. When Dee says "do what you think is better", decide and do it.
- Keep replies short. Dee worries about chat tokens. Do not paste whole code files back into the chat unless asked.
- Terminal walk-throughs: give ONE command (or one chained command), then wait for Dee to paste the output before saying more.
- "No more zip files" applies to Claude's DELIVERY. Delivery is: build and test in the sandbox, put ONLY the changed or new files flat in `/mnt/user-data/outputs/stepN/`, show them with the file-send tool (full file replacements, not diffs). Dee downloads them to Downloads and runs ONE chained command, for example:
  `cd ~/projects/shirube && D=/mnt/c/Users/kazuri/Downloads && cp $D/x.js lib/ && cp $D/y.js routes/ && ... && npm test`
  Keep the file names unique so the flat copy has no clashes (e.g. `routes-profile.js` -> `routes/profile.js`, `pages-profile.js` -> `public/js/pages/profile.js`). Then Dee runs `npm start`, looks, and commits with a one-line `git add -A && git commit -m "..."` that Claude gives.
- When Dee says "dont build anything, just tell me", do not build or call code tools. Just answer.
- Delivery message order: the file cards, one command, what to look for, then short notes on decisions Claude made.
- Uploading the repo once at the start of a new chat is fine (done this chat via `git archive`).

**Git**
- Only `main` kept locally. `main` is the OLD app at `b3e3ea3`, untouched.
- Working branch `v1-rebuild`. Commits so far: `dcf5502` (remove old app code), step 1 "feat: server, database schema and health check", `b58eca5` "feat: app shell with sidebar, top bar and page router", `983ef03` "feat: jobs list and add job", `9a4a807` "feat: job detail with stages, outcome and edit". Step 5 not committed yet. Not pushed yet.
- Old jobs data was moved to `~/shirube-old-data` (not deleted).
- Kept for now: `.gitignore`, `AGENTS.md`, `GEMINI.md`, `README.md`, `docs/`. `AGENTS.md`, `README.md` and `docs/` describe the OLD app and are outdated. Do not edit `AGENTS.md`, `GEMINI.md` or `docs/` unless Dee asks. `README.md` and `LICENSE` come at the end.
- The old `~/apply-step.sh` zip script is no longer used.

**Architecture and scope**
- SQLite via `node:sqlite` (needs Node 22.13+), file `data/shirube.db` (gitignored). The "SQLite is experimental" warning is normal.
- Server listens on `127.0.0.1` only, port 3000 (`PORT` env; `SHIRUBE_DB` env for the db file). Refuses other Host headers and cross-site Origins on non-GET.
- Other job sites: not in v1. Local AI model: NOT in v1 (Match = keyword matching; "what works" = counting Dee's own numbers). Version 1 is for Dee only.
- v1 screens: Dashboard, Jobs, Job detail, Add job, My profile. Out of v1: Found, Saved searches, Follow-ups, Job match, What works, CV export, the bell, "Check my match".
- Build order, one commit each: (1) server+DB DONE, (2) shell DONE, (3) Jobs list + Add job DONE, (4) Job detail DONE, (5) My profile BUILT (awaiting Dee's check and commit), (6) Dashboard NEXT.

**Look (from the design system, applied in code)**
- Frame `#1F4FFF`, panel `#211D1E`, cards `#2B2627`, raised `#3A3436`. Text `#F4F1EF`, muted `#C3BBB8`. Card outline `#4A4143`, control outline `#8A8082`, row divider `#3F3739`. Orange `#ff5a36` main button with dark text (ONE per screen). Yellow `#ffd966` active sidebar icon and avatar. Link `#ff8a6b`. Delete only `#ff8a80`. Outfit font 400/500/600. Radii: cards 45, inner boxes 24, buttons/inputs/chips 12, tags 8. Spacing 4/8/12/16/24/32. Tap target 44px.
- Status is shape plus word, never colour alone: ◌ To apply, ● Applied, ○ Reply, ■ Interview, ◆ Offer, ▲ Rejected, □ Due, ◇ errors, ✓ chosen/saved.

**Step 5 decisions (Claude made them, Dee has not objected yet)**
- Migration `003_profile_fields.sql` adds `profile.portfolio`, `profile.social` (GitHub or LinkedIn link), `profile.active_preset_id` (FK to presets, ON DELETE SET NULL), and seeds one preset named "General" and points the profile at it. There is always at least one preset; the last one cannot be deleted. Dee should rename "General" to "SRE / DevOps".
- Phone kept in Basics (the CV needs it) though the mockup left it out. Portfolio and GitHub/LinkedIn must start with http:// or https://. Email gets a light check. Follow-up days: whole number 1 to 365. Time zone checked with Intl.
- Presets: the selected chip = the ✓ preset = `active_preset_id`. Per preset: name, target role, summary, skills (JSON array, trimmed, case-insensitive dedupe, max 60, 50 chars each), and which Experience entries are Shown. Education and Experience entries are shared across presets. No reordering in v1.
- Save profile (`PATCH /api/profile`) saves basics, settings, active preset and ALL presets in one transaction. Education/experience/new-preset/delete-preset save immediately through their own small forms; unsaved typing in the main fields is kept (client `collect()` + `merge()`). A new experience starts Shown in the preset being edited (`show_in`).
- Backup = JSON of all tables `{app:'shirube', version:1, exported_at, tables}` via `GET /api/backup`; downloaded in the browser as `shirube-backup-YYYY-MM-DD.json`. Restore (`POST /api/restore`) REPLACES everything in one transaction (all or nothing), asks `confirm()` first, ignores unknown columns, and makes sure one active preset exists afterwards. Raw `.db` file not used because overwriting it while the server runs is unsafe.
- Server body limit raised from 1 MB to 25 MB (for restore).
- Top-bar avatar shows initials from the profile name (e.g. "DR"), person icon when no name. `main.js` loads `/api/profile` at start and listens for a `profile-saved` window event. No Welcome line (skipped).
- Dates in Education/Experience are free text (e.g. "2021", "2025"); empty end shows "to now".

**Earlier choices that differ from the mockups (Dee has not objected)**
- Sidebar has only Dashboard and Jobs; no bell. Top-bar search button is grey. Add job uses date inputs, Source has an "Other" chip, chips are 40px high, "Archived" and "Follow up today" left out.
- Stage and status rules: status is DERIVED from stages (Rejected wins; else furthest of applied < reply < interview < offer; none = `open`). `follow_up` and `other` never change status. `applied_on` = earliest dated Applied stage. Outcome chips add a stage dated today; "Undo last step" removes the newest stage. Follow-up card shows "□ Due" if its date is today or later, else "Done".

## Current state

**Repo layout on `v1-rebuild` (steps 1 to 4 committed; step 5 files delivered, not yet committed)**
- `server.js` static + JSON API, security checks, exports `createServer(db)`; `db.js` `openDb(file)` runs `migrations/*.sql` in order.
- `migrations/` 001_init, 002_job_fields, 003_profile_fields (new).
- `lib/` errors.js (HttpError), validate-job.js, stage-rules.js, validate-profile.js (new: cleanBasics, cleanSkills, cleanPreset, cleanEducation, cleanExperience).
- `routes/` index.js (route table; order matters), health.js, jobs.js, stages.js, profile.js (new: getProfile, saveProfile, createPreset, deletePreset, education/experience create/update/delete, exports `tx` and `ensurePreset`), backup.js (new: exportBackup, restoreBackup).
- `public/` index.html (avatar link now has id `avatar` and an `.initials` span), css (tokens, base, shell, app), js (main.js, router.js, routes.js, lib/html.js, api.js, status.js, format.js, parse-advert.js, pages/dashboard.js = placeholder "Built in step N", jobs.js, job-new.js, job-detail.js, profile.js = real page now).
- `test/` smoke, client, jobs-api, stages-api, profile-api (new). 36 tests; all pass in the sandbox (30 old + 6 new).

**API:** jobs and stages as before (see below), plus new: `GET/PATCH /api/profile`, `POST /api/presets`, `DELETE /api/presets/:id`, `POST /api/education`, `PATCH/DELETE /api/education/:id`, `POST /api/experience`, `PATCH/DELETE /api/experience/:id`, `GET /api/backup`, `POST /api/restore`. Mutating profile routes return the whole `{profile, presets (with skills[] and experience_ids[]), education, experience}`; create routes also return `id`.
- Jobs: `GET /api/jobs?status=&q=` -> `{jobs, counts, next_closing}`; `POST /api/jobs`; `GET /api/jobs/duplicate`; `GET/PATCH/DELETE /api/jobs/:id`; stages: `POST /api/jobs/:id/stages`, `PATCH/DELETE /api/stages/:id` (all return `{job, stages}`).

**Database:** `profile` (single row id=1: name, email, phone, location, follow_up_days default 7, time_zone default Asia/Colombo, portfolio, social, active_preset_id), `presets`, `education`, `experience`, `preset_experience` (row = Shown), `jobs` (status open|applied|reply|interview|offer|rejected, source, url, location, description, notes, applied_on, created_at, updated_at, work_mode, job_type, found_on, closes_on), `stages`. Dates are text `YYYY-MM-DD`.

**Client conventions:** hash routes (`#/`, `#/jobs`, `#/jobs/new`, `#/jobs/:id`, `#/profile`). A page exports `render(el, {params, query, stale})`: fetch first, check `stale()`, then write `el.innerHTML = html\`...\``. Events ONLY via `el.onclick/oninput/onchange/onsubmit` (router clears them per page). `html\`\`` escapes every value; attribute strings built in code must be wrapped in `raw()` or they get escaped (this caused a bug in step 5, now fixed). SVG elements have no `.hidden` property; use `toggleAttribute('hidden')`. Useful classes: `.page-head`, `.card`, `.card.compact`, `.tile`, `.grid-tiles`, `.grid-main-side`, `.list-row`, `.avatar`, `.tag`, `.chip`, `.btn` + `-primary/-secondary/-danger/-dashed`, `.input`, `.label`, `.field-error`, `.inner-box`, `.fields`, `.fields3`, `.card-head`, `.entry`, `.link-btn`, `.skill`, `.row`, `.stack`, `.section`, `.text-muted/.text-sm/.text-xs`.

**Checks done for step 5 in the sandbox:** 36 node tests pass; Playwright headless run passed with zero console errors (typing kept across adds, presets, skills, education/experience add/edit/remove, Shown toggle, save + reload persistence, bad email error, backup download, restore, bad restore file, delete preset, avatar initials); screenshot at 1512x982 looked right. Dee has not yet run the step 5 command or seen it in Brave.

## Next steps
1. IMPORTANT: the new chat's sandbox does NOT have the code. Ask Dee to upload the current repo: `cd ~/projects/shirube && git archive --format=zip -o /mnt/c/Users/kazuri/Downloads/shirube-current.zip HEAD`, then upload `shirube-current.zip`. Dee also pastes the 4 design files. Unzip into `/home/claude/shirube` and work from it. (First check with Dee that step 5 was copied in, `npm test` passed and he committed it; if not, remind him of the step 5 command and commit line `git add -A && git commit -m "feat: my profile with presets, education, experience and backup"`. If he did not commit, the zip from HEAD will not contain step 5, so ask him to commit first.)
2. Step 6, Dashboard: re-extract the Dashboard board (index 0) from `Shirube_screens_v4.html` and read it. Summarise jobs from existing data: open to apply, applied, status counts, "what happened" from stages, closing soon (`next_closing` already exists). Keep it to what the data supports (no AI). Use the one shell, not the mockup's slightly different shell. Drop or simplify "What you can add" and "How to improve" unless the data supports them. A Dashboard API route (for example `GET /api/dashboard`) is likely needed. Optionally use the profile name for a Welcome line (Dee has not asked for one).
3. Each step: write code in the sandbox, run `timeout 90 npm test`, run a real headless-browser check and view a screenshot, copy only changed files to `/mnt/user-data/outputs/step6/`, send them, give the ONE chained cp + `npm test` command, then after Dee reports, `npm start` and a commit line.
4. Only after Dee confirms each: `LICENSE` (MIT) and a new `README.md` (setup for someone who is not Dee, `npm start`, Node version, where data lives and that it is gitignored), clean up the old `AGENTS.md` / `docs/`, push `v1-rebuild`, merge into `main`. Later versions, one at a time: Found (job-site reading), Saved searches, Follow-ups, Job match and CV export (PDF and Word), link import, location field, alert-email reader, optional local model.

## Sandbox tips (learned the hard way)
- A new test file that starts a server MUST end with `test.after(() => server.close());` or `npm test` hangs forever. Run tests with `timeout 90 npm test 2>&1 | grep -E '^# (tests|pass|fail)|^not ok'` (the sandbox prints `# tests` lines, Dee's Node 26 prints `ℹ tests`).
- Never use `pkill -f` with a pattern that appears in the command's own text (it kills the shell). `pkill -f "node server.js"` worked fine when run as its own command. Start the app with `(SHIRUBE_DB=/tmp/t.db PORT=3111 node server.js >/tmp/srv.log 2>&1 &)`, run the Playwright script (Python, `python3 -I`, Chromium works), stop the server at the end. Delete the temp db and restart the server between browser runs.
- In Playwright, async clicks (save, create) need a short wait (about 500 ms) before asserting on the result, or the check races the fetch.
- Google Fonts are blocked in the sandbox, so screenshots use a fallback font and the console shows `ERR_NAME_NOT_RESOLVED` / `ERR_TUNNEL_CONNECTION_FAILED`. That is normal.
- Mockup file `Shirube_screens_v4.html` is a bundle of 10 boards. Parse the `<script type="__bundler/manifest">` JSON (each entry has `compressed`, base64 `data`; gunzip if compressed) and `__bundler/page_order`. Board order: 0 Dashboard, 1 Jobs, 2 Job detail, 3 Found, 4 Saved searches, 5 Add job, 6 Job match, 7 Profile, 8 Follow-ups, 9 What works. Each board's real markup is the JSON string inside its own `<script type="__bundler/template">`. Strip `data:...base64` strings, collapse whitespace, print from `<div class="mn"` onward. A working extraction script pattern was used for board 7 (change the index for the Dashboard).
- All company names, jobs and CV details in mockups are made up. Dee's real test data uses things like "Northwindw AMC" and "Junior Devops Eng".

## Open questions
- Did Dee run step 5, was it fine, and did he commit? Any objections to the step 5 decisions (Portfolio/social fields, Phone kept, "General" starter preset, replace-all restore, no Welcome line)?
- Link fields need http(s)://: should the app add it automatically instead?
- "To apply" symbol: code uses ◌, which looks like ○ (Reply) at small size; the word keeps it clear. Keep ◌?
- Quick date chips ("Tomorrow", "1 week") on Add job instead of date pickers? Chip height 40px OK?
- "Archived" chip dropped from v1; add later? Should "Follow up today" come back with Follow-ups?
- Job detail has no Delete button (delete is on the Jobs list only). Add one? Follow-up has no overdue state; fine for v1?
- Later-version design questions: merge Jobs list and Follow-ups or keep both; keep or drop What works; how "no advert saved" looks in Job match; Found as "New since your last visit" main view or a tab (open canvas comment thread `bd37d3ad-ed53-4183-be3a-5a120725f52a`, unanswered); Job match needs the advert in the job's Description.
- Import jobs from `~/shirube-old-data` into the new database? (Probably not needed.)
- When to push `v1-rebuild` and merge into `main` (old app lives on `main`); delete old remote branches on GitHub?
- Chips and small muted text contrast, hover and disabled states were never fully designed.

## Suggested skills
- `handoff`: at the end of the next session.
- `grill-me`: before designing Found/job-site reading, saved searches, the alert-email reader, CV export, or the optional local model.
- `frontend-design`: when the Dashboard needs real visual decisions beyond the mockup.
- `file-collector` is for a different project (Blanche Bridal). Do not use it for Shirube.