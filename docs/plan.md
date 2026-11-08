# Shirube: plan

Shirube is a local job-application tracker. It runs on your laptop, keeps your
data in one file, and needs no account. Sri Lankan job seekers come first, and
the lists of fields and sources can be extended later.

Each phase ends with something you can open in the browser and check.

## Phases

1. **Setup.** The server starts, the database file and tables are created, and
   the shell page loads. *Done.*
2. **Profile.** Skills with the 1–5 slider, experience and volunteering,
   education. Saved to the database.
3. **Jobs list.** Add a job (paste first, then check every field), the stage
   chips, the sort, and open a job.
4. **Job page.** Outcome buttons, the rejection reason, the timeline, notes,
   edit, and delete with a confirm step.
5. **Follow-ups.** Due dates worked out from the settings, and the "coming up"
   section.
6. **Settings.** Due-date days, role types ("Other" locked), sources, and
   rejection reasons.
7. **What works.** Numbers only, with one date range for the whole page.
8. **Get started.** The first-run checklist, with "Dismiss for now" and
   "Don't show again".
9. **Backup.** Export and import as one JSON file.
10. **CV reading and local model.** Later and optional.

## Order and reasons

Profile comes first because skills are what jobs are matched against later.
Jobs comes next, and the Job page follows because outcomes need a job to exist.

## Out of scope for now

- Hosting, accounts, or any sync between computers.
- Automatic sending of applications or email.
- Skills matching against job posts (later phase, after Profile and Jobs).
- Colour themes other than dark.