# Shirube: spec

This file says what the app stores and the rules it follows. The tables live in
`schema.sql`. If the two disagree, stop and ask.

## Data

**jobs**: one row per job posting. Title and company are required. Source is
text, guessed from the link and changeable. Closing date and posted date are
optional. `job_status` is `open`, `closed` or `skipped`.

**applications**: at most one per job. A job with no application row is
"to apply". Status is `applied`, `screening`, `interview`, `offer`,
`rejected` or `no_reply`. Holds the rejection reason as text.

**replies**: every reply you log. Kinds: `replied`, `first_interview`,
`second_interview`, `test_task`, `rejected`, `offer`.

**cv_versions**: a name and a date for each CV you send. The app records the
version, not the file.

**experiences**: experience and volunteering, with a title, organisation,
start, end or "Present" (`is_current`), and a description.

**education**: course, institution, start and end.

**skills**: name, level 1–5, optional proof link, and optionally the
experience where you used it.

**settings**: one row per key. Due-date days, role types, sources and rejection
reasons are kept here as JSON lists.

## Stages

- A job with no application is **To apply**, unless the job is `skipped`.
- Otherwise the stage is the application's status.
- **Stale** means no application and posted (or found) more than 30 days ago.

## Outcome buttons (Job page)

Each button adds a reply or sets the application status:

| Button    | Reply kind        | Application status |
|-----------|-------------------|--------------------|
| Applied   | (none)            | `applied`          |
| Reply     | `replied`         | `screening`        |
| Interview | `first_interview` | `interview`        |
| Offer     | `offer`           | `offer`            |
| Rejected  | `rejected`        | `rejected`         |
| No reply  | (none)            | `no_reply`         |

Second interviews and test tasks are logged through the reply log form, not
through the outcome buttons.

Clicking the outcome the job already has does nothing. Rejection reason is only
asked for when Rejected is chosen.

## Dates

- Due dates are worked out from the applied date plus the number of days in
  Settings (7, 14 or 21). They are never stored.
- Days are counted from the applied date. The first follow-up is counted from
  the applied date. Later waits are counted from the date you last followed up.
- All dates are shown in Asia/Colombo time.

## Adding a job

1. Paste the link or the job text first. The app fills what it can.
2. Check every field before saving. Title and company are required.
3. Source is guessed from a known site. For an unknown site, the app asks,
   with a list and "Other".
4. If a job with the same company and title exists, show a warning. Never block
   the save.
5. Saving goes to the Job page.

## Skills

- Level 1 to 5: Aware, Beginner, Intermediate, Advanced, Expert. Each level has a
  one-line meaning on screen.
- "Verified" shows only when there is a proof link or the skill is linked to an
  experience entry.

## What works

- Shows numbers, not sentences.
- One date range (Last 30 days or All time) applies to every number on the page.
- Reply rate is replies divided by applications, per group.
- A group with fewer than 3 applications shows its count, with no rate.
- Withdrawn applications are left out.
- Patterns appear after 20 logged applications. Before that, show "Not enough data".

## Backup

One JSON file with a version number. Export and import use the same format.