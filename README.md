# Shirube

A local job-application tracker. Your data stays on your machine, in `data/shirube.db`.

## Run it

You need Node.js 22.13 or newer.

```
npm start
```

Then open http://localhost:3000 in your browser.

## Where things are

- `server.js` starts the app and serves the pages.
- `db.js` opens the database and creates the tables from `schema.sql`.
- `public/` holds the pages, the scripts and the styles.
- `data/` holds your database. It is never committed.