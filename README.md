# Shirube

A job-application tracker that runs on your own computer. No account, no cloud, no hosting. Your data stays in one file on your machine.

Built for job seekers, starting with Sri Lanka.

## What it does

- **Dashboard**: jobs to apply to (closing soonest first), your applications, what happened lately, and what to do next.
- **Jobs**: add a job, filter by stage, search by title or company.
- **Job detail**: record each stage (Applied, Reply, Interview, Offer, Rejected, Follow-up). The job status follows your stages.
- **Follow-ups** (the clock icon, "Applied jobs"): a board of every job you applied to, in four columns (waiting, calls and interviews, offer, closed), with the stages of each. A bell in the top bar shows how many follow-ups are due. The number of days to wait is set in My profile.
- **Found** (the magnifier icon): reads ITPro's job feeds when you press Refresh. Search what is saved, filter by work mode and date, read the advert, then **Save to Jobs** or **Hide**. Jobs first seen since you last left the page are tagged New. Shirube only ever contacts `itpro.lk`, only when you press Refresh, and at most every 30 minutes.
- **My profile**: your details, role presets (for example "SRE / DevOps"), skills, education, experience, and a backup and restore.

## Run it

You need [Node.js](https://nodejs.org) 22.13 or newer. There is nothing else to install.

```
git clone https://github.com/deelaka-ransilu/shirube.git
cd shirube
npm start
```

Open http://localhost:3000 in your browser.

Node may print a warning that SQLite is experimental. That is normal.

To use another port: `PORT=3001 npm start`

## Your data

Everything is stored in `data/shirube.db`, created the first time you start the app. The `data/` folder is not part of the repository.

The server only answers on your own computer (`127.0.0.1`). It is not reachable from other devices.

To back up, open My profile and use **Backup**. It downloads a JSON file. **Restore** replaces everything in the app with that file.

## Tests

```
npm test
```

## Project layout

- `server.js`: static files and the JSON API
- `db.js` and `migrations/`: the SQLite database and its schema
- `routes/` and `lib/`: API handlers and checks
- `public/`: the pages, scripts and styles (plain HTML and JavaScript, no build step)
- `test/`: tests (Node's built-in test runner)

## Licence

MIT. See `LICENSE`.
