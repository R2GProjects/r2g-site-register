# R2G Site Register — Readme

Worker attendance and visitor registration system for R2G Projects construction sites.

## Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Database:** NocoDB v2 API (PostgreSQL 14 backend)
- **Deployment:** Docker (standalone output)
- **Reverse Proxy:** nginx → Synology HTTPS

## Quick Start

```bash
docker compose up -d
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `NOCODB_URL` — NocoDB API URL (default: `http://nocodb:8080`)
- `NOCODB_API_TOKEN` — NocoDB API token
- `ADMIN_USERNAME` — Admin login username
- `ADMIN_PASSWORD` — Admin login password
- `SESSION_SECRET` — HMAC key for admin sessions. **Required in production** — the app will not start without it. Generate with `openssl rand -hex 32`.
- `CRON_SECRET` — shared secret for the scheduled auto-close job. Generate the same way.
- `AUTO_CLOSE_CUTOFF` — optional, default `18:00`. Site-local time stamped on a forgotten day shift.
- `AUTO_CLOSE_MAX_HOURS` — optional, default `12`. A record open longer than this is treated as a forgotten sign-out.
- `INDUCTION_VALIDITY_DAYS` — optional, default `365`. How long a site induction stays valid before it must be run again.

## Induction expiry

A site induction lapses after `INDUCTION_VALIDITY_DAYS`. Sign-in re-prompts once
it has, and the worker dashboard flags a lapsed site before they travel.

Access records created before expiry tracking have no induction date. Those are
aged from when the access was granted rather than being grandfathered forever,
so they do lapse — but a record with no usable date at all is treated as valid,
because turning someone away over missing data is the wrong way to fail. Expect
a wave of re-inductions on older sites after the first deploy.

## Duplicate registrations

Registering again is what someone does when they have forgotten how to sign in,
and each of those used to mint a second person record — splitting that worker's
hours, inductions and site access across two identities nothing links together.

Registration now looks for an existing person by mobile (compared as digits, so
formatting differences still match) or email, and refuses to create a second
record. On the site sign-in page, a worker who supplies the passcode that
matches the existing record is recognised and signed in against it instead,
which turns the dead end into the recovery path people were already attempting.
Anyone else is told to sign in or see the supervisor.

## Tests

```bash
npm test          # run once
npm run test:watch
npm run typecheck
```

The suite covers the logic whose output the register is relied on for: the hours
calculation, site-local day boundaries and daylight saving, the auto-close
decision, passcode hashing and visitor pass signing, the NocoDB filter escaping,
and the evacuation roll grouping. These are pure functions, so the tests need no
database and no network.

CI runs the typecheck, the tests and a production build on every push and pull
request.

## Scheduled auto-close

Workers who forget to sign out would otherwise accumulate hours forever and stay
on the evacuation list. `POST /api/cron/auto-close` closes any record left open
past `AUTO_CLOSE_MAX_HOURS`, stamping the sign-out at that day's
`AUTO_CLOSE_CUTOFF` where that falls inside the shift, and writes an
`AutoSignOut` audit entry for each one.

The check is elapsed time rather than calendar date, so a night-shift worker who
started at 11pm and is still on site at 2am is left alone.

Add a nightly task in Synology **Control Panel → Task Scheduler** (2am suits,
since it is after any late shift has ended):

```bash
curl -fsS -X POST https://<host>/api/cron/auto-close \
  -H "Authorization: Bearer $CRON_SECRET"
```

Preview without changing anything by appending `?dryRun=1`. A signed-in admin
can also run it from the browser without the secret.

## Documentation

- `SYSTEM-ARCHITECTURE-v1.md` — Architecture, components, data flow
- `DATABASE-SCHEMA-v1.md` — All tables, fields, relationships
- `DEPLOYMENT-GUIDE-v1.md` — Docker, start/stop/restart/recover
- `NOCODB-API-USAGE-v1.md` — API endpoints, field mappings
- `SITE-SETUP-PROCEDURE-v1.md` — Create sites, generate QR codes
- `WORKER-REGISTRATION-PROCEDURE-v1.md` — Register workers, approve, sign in/out
- `INCIDENT-CORRECTION-PROCEDURE-v1.md` — Correct records, audit trail
- `BACKUP-RECOVERY-v1.md` — PostgreSQL dump, restore, disaster recovery
- `BUILD-REPORT-v1.md` — Build status, route table, E2E results
- `DISCOVERY-REPORT-v1.md` — Environment audit, architecture decisions
- `SCHEMA-VERIFICATION-v1.md` — NocoDB table creation verification
- `CHANGELOG.md` — Implementation changelog