# Shirube: rules for coding agents

## What this is
A local job-application tracker for one user. It runs on a laptop only.
Open source (MIT) later. No login, no hosting, no cloud services.
Sri Lankan job seekers come first. Keep field and source lists easy to extend.

## Stack (do not change without asking)
- Node.js 22.13 or newer, plain JavaScript (ES modules). No framework, no build step.
- SQLite through the built-in `node:sqlite`. No npm packages for the database.
- Plain HTML, CSS and JavaScript in `public/`.
- Colours and spacing come from `public/tokens.css` only.
- Fonts load from the system until we decide otherwise.

## Layout
- `server.js` starts the app and serves `public/`. API routes go in `routes/`.
- `db.js` opens `data/shirube.db`. `schema.sql` holds the tables.
- `public/index.html` is the shell. `public/app.js` switches screens by `#hash`.
- `docs/` holds the plan, spec and design notes.
- `data/` is private and gitignored. Never read, print or commit anything in it.

## Hard rules
1. Do only the step the owner names. Never start the next step.
2. Read `docs/plan.md` and `docs/spec.md` before coding. If a request conflicts with them, stop and ask.
3. SQL is always parameterized (`?` placeholders with `prepare().run(...)`). Never build SQL with string joins or template literals.
4. Never read, print or commit `data/`. Never commit `.env`.
5. No new npm dependency without asking first. Say what it is and why.
6. Colours and spacing come from `tokens.css` only. No hard-coded colours or pixel values in other files.
7. Status is shown with a shape plus a word, never colour alone.
8. Blue is for hits only (active item, focus, offers). Danger red is for delete buttons only.
9. Keep code simple. Small functions, short comments that say why. The owner must be able to explain every file.
10. Do not edit `AGENTS.md`, `GEMINI.md` or `docs/` unless the owner asks.
11. Table changes are a new file, never an edit to `schema.sql` once a database exists. Add numbered migration files when that step comes.
12. All files use LF line endings.

## End of every session
1. Run `npm start` and check the page loads. Report the result.
2. List the files changed, one line each.
3. Say how to check the change in the browser.
4. Do not commit. The owner commits after review.