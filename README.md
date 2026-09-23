# CSSD Digital Logbooks — v2
### Tebow CURE Children's Hospital — RO Water Quality · Equipment Downtime · Cleaning Brush

## 1. Create your database (Supabase — free)

1. [supabase.com](https://supabase.com) → **New Project**.
2. **SQL Editor → New query** → paste all of `sql/schema.sql` → **Run**.
   - This seeds your actual team (Ralp, DX, Anthony, Joshua, Josh) with starter PINs — see the bottom of that file.
   - **Already ran the old (v1) schema?** Run `sql/reset_and_upgrade.sql` first, then `sql/schema.sql`. (Only do this if you have no real data yet — see the warning comment at the top of that file.)
3. **Project Settings → API** → copy the **Project URL** and **anon public** key.

## 2. Connect the app

Open `js/config.js`, paste in your URL and anon key, save. That's the only file you edit.

## 3. Deploy to GitHub Pages

Upload `index.html`, `css/`, and `js/` to a public GitHub repo → **Settings → Pages** → Source: `main` / root. Your app is live at `https://your-username.github.io/your-repo/`.

## 4. First login

Every account starts on the shared default PIN **`0000`**. Log in as **Ralp** or **DX** (superuser) — after entering `0000`, the app will offer to let you set a personal PIN and two security questions right there. Do that immediately; everyone should personalize their PIN on first use rather than staying on the default.

Then, in **Manage Staff & Settings**:
- Review the **RO thresholds** — conductivity and TDS have starter defaults, but **microbial count is intentionally left blank**. Confirm the correct limit against your RO system's validated spec sheet or ANSI/AAMI ST108:2023 before setting it; don't use a guessed number.
- Add your actual machines (autoclaves + the RO system) with their scheduled operating hours/day.
- Set **logbook assignments** — who gets flagged if RO, brush, or equipment logs are missed.

## Roles

| Role | Logbooks | Dashboard & Reports | Manage Staff & Settings |
|---|---|---|---|
| **Superuser** (Ralp, DX) | ✓ | ✓ | ✓ |
| **Admin** (Anthony) | ✓ | ✓ | — |
| **User** (Joshua, Josh) | ✓ | — | — |

## Account creation & PIN recovery

Both happen from the **login screen**, not inside the app:
- **Create a new account** — requires a superuser to authorize with their own PIN, then just needs the new person's name, job title, and role. The account starts on the default PIN (`0000`) — the person sets their own PIN and two security questions the first time they log in with it.
- **Forgot your PIN?** — appears once you've picked your name, for anyone who has already personalized their PIN. Answer both of your security questions, then set a new PIN yourself. No superuser needed for this part — that's the point of the security questions.
- **Manage Staff & Settings → Reset PIN** — a superuser can reset anyone straight back to the default PIN state (clears their security questions too) if they're locked out or leaving.

## Missed-log alerts

The login screen shows a "Needs attention" panel alongside the staff list if: RO hasn't been logged today, any active brush hasn't been inspected this week, or there are open equipment incidents — each tagged with whoever is assigned to that logbook in Admin.

## The three logbooks

- **RO Water Quality** (`TCCH-SPU-PROC-015`) — conductivity, TDS, and microbial count are logged and evaluated separately, each with its own pass/fail. pH, temperature, and salinity are logged too, for reference.
- **Equipment Downtime** (`TCCH-SPU-PROC-013`) — autoclaves and the RO system share one machine list. Logging an incident only asks for the machine, time broken, time reported, and time biomed responded. Resolving it (from the "Resolved/Repaired" button) asks for time back up, root cause category, remarks, and reported by.
- **Cleaning Brush** (`TCCH-SPU-PROC-007`) — "Register a brush" auto-generates an ID (`BR-001`, `BR-002`, …) and sets today as its in-service date. "Brush Log" shows every registered brush as its own card — log or discard, per brush, per visit.

## KPI Reports

Pick a logbook and a date range:
- **RO** — pick a parameter (conductivity / TDS / microbial); each gets its own report and compliance rate.
- **Equipment** — pick a specific machine; downtime rate is always reported per machine, never averaged across your fleet. Includes Mean Time Between Failures and a root-cause breakdown (mechanical / BI-CI quarantine / scheduled PM overrun) as secondary metrics.
- **Brush** — weekly inspection compliance rate, plus a brush failure/replacement rate as a secondary metric.

Every report exports as a PDF formatted like `TCCH/QPS/FRM/011`.

## Updating the app later

There's a **Version & Updates** panel in Manage Staff & Settings (superuser only) — it shows the current version and explains the update process. Short version: this app deliberately does **not** let anyone push new code into it from inside the browser. That would mean a superuser PIN alone could put unreviewed code straight into a live hospital system with no review step and no rollback — not a risk worth taking for something you'll update a few times a year.

Instead: when you need changes, describe them to Claude, get updated files back, and upload them to your GitHub repo (drag-and-drop via **Add file → Upload files** on github.com — no command line needed). GitHub Pages rebuilds in about a minute. Your Supabase database is entirely separate from the app's code, so this never touches or risks your logged data. The only time the database itself changes is if a new feature needs a new field or table — in that case you'd get one short, additive SQL script to run once in the Supabase SQL Editor.

## Security note

PINs and security-question answers are stored as plain text (not hashed) — a reasonable tradeoff for a fast, low-risk internal tool with no patient data, but worth knowing. Don't reuse these PINs anywhere sensitive, and deactivate accounts promptly when someone leaves.

## Costs

Free at this scale — Supabase's free tier and GitHub Pages both comfortably cover a 5-person department logging a few entries a day.
