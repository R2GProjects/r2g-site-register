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
- `CRON_SECRET` — shared secret for the scheduled auto-close and retention jobs. Generate the same way.
- `AUTO_CLOSE_CUTOFF` — optional, default `18:00`. Site-local time stamped on a forgotten day shift.
- `AUTO_CLOSE_MAX_HOURS` — optional, default `12`. A record open longer than this is treated as a forgotten sign-out.
- `INDUCTION_VALIDITY_DAYS` — optional, default `365`. How long a site induction stays valid before it must be run again.
- `DATA_RETENTION_YEARS` — optional, default `7`. Stated in the collection notice; changing it changes the notice version.
- `PRIVACY_CONTACT` — optional. Named in the notice as who to ask about personal information.
- `GEOFENCE_RADIUS_METRES` — optional, default `300`. How far from the site pin a GPS sign-in still counts. Fifty to 2000 metres.

## Induction expiry

A site induction lapses after `INDUCTION_VALIDITY_DAYS`. Sign-in re-prompts once
it has, and the worker dashboard flags a lapsed site before they travel.

Access records created before expiry tracking have no induction date. Those are
aged from when the access was granted rather than being grandfathered forever,
so they do lapse — but a record with no usable date at all is treated as valid,
because turning someone away over missing data is the wrong way to fail. Expect
a wave of re-inductions on older sites after the first deploy.

## White card and licence expiry

A white card is a legal prerequisite for construction work, so sign-in is
blocked once a recorded expiry date has passed, naming the ticket that lapsed.

Nothing is enforced until a date exists. No expiry is stored anywhere today, so
nobody is locked out by deploying this — enforcement arrives one worker at a
time as the dates are entered in Admin → People. A worker with no card on
record, or with a date the app cannot read, is still let through and flagged in
the admin list instead; refusing entry over missing data is the wrong way to
fail.

A card is valid for the whole of its expiry day. Dates carry no timezone and a
licence is not tied to a site, so end of day resolves in UTC, which in
Australian time leaves a card valid into the following morning. The error runs
in the worker's favour, which is the right direction for a rule that stops
someone earning.

`CREDENTIAL_WARN_DAYS` (default 30) sets how far ahead a ticket is flagged as
expiring, on the worker dashboard and in the admin list.

The two expiry columns are created in NocoDB on first use, so no manual schema
change is needed.

A photograph of the card can be taken at registration or added later in
Admin → People. It is stored as a compressed JPEG so a phone camera dump cannot
blow the request, and the server checks the media type, base64 alphabet and
size rather than trusting the client — the same checks that keep an SVG
carrying script out of the signature field. Photos are left out of the people
list so a page of names does not pull megabytes; opening a person loads them.
A photo is optional. Missing one does not block sign-in, for the same reason a
missing expiry does not: refusing entry over data nobody has yet supplied is
the wrong way to fail. A photographed card is evidence a supervisor can look
at. It is not a check against an issuer register.

## Person photograph

A photograph of the worker can be taken at registration or added in
Admin → People. It is stored the same way as a card photo, and shown on the
evacuation list and the on-site screen so a muster point can put a face to a
name. It is left out of the people list, and the on-site API only includes it
when that screen asks for it, so a page of names does not pull every photo on
site. A photo is optional. Missing one does not block sign-in.

## Sign-in presence

Signing in to a site requires evidence of being there. A GPS reading inside
`GEOFENCE_RADIUS_METRES` of the site pin (default 300 m) is recorded as
`Geofence`. Opening the site page — the URL the gate QR points at — sets a
short-lived cookie and is recorded as `SiteQR`, which is the fallback when the
phone will not share a location. A GPS reading outside the fence is refused
even if that cookie is present, so a phone at home that once opened the site
page cannot sign in. Sites with no latitude and longitude on file can only be
signed into via the gate QR. The worker dashboard still lists sites, but
picking one from the couch is no longer enough.

## Induction signatures

Completing an induction requires a drawn signature. It is stored with a copy of
the exact rules text shown at the time and a version derived from that text, so
editing a site's rules changes the version on its own and an induction signed
against the old wording stays distinguishable from one signed against the new.

The rules are copied into the record rather than referenced. A version pointing
at text a site manager can edit afterwards proves nothing about what a given
worker was shown, which is the whole point of keeping the record.

Admin → Inductions lists the signed records with site and date filters, and
opening one shows the signature and the rules that were accepted. Inductions
completed before this shipped have no signature and say so.

## Privacy notice

Worker and visitor registration shows a collection notice and will not submit
without an acknowledgement. The acceptance records which wording was shown, so
editing the notice (or changing `DATA_RETENTION_YEARS`) produces a new version
and older acceptances stay distinguishable.

The notice is served from `/api/privacy` rather than copied into the page, so
the text a person reads is the same text the version is computed from. The
wording is a plain-language draft covering what the Australian Privacy Act
expects at the point of collection — it is not legal advice and should be read
by whoever is accountable for the business's privacy obligations.

`PRIVACY_CONTACT` is the name shown in the "how to ask" section. The two
acceptance columns are created in NocoDB on first use.

This records consent. Personal details older than `DATA_RETENTION_YEARS` are
stripped by the retention job below. Attendance facts are kept.

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

## Data retention

The collection notice states that personal details are kept for
`DATA_RETENTION_YEARS`. `POST /api/cron/retention` honours that: it strips
identifying fields from people and visitors whose last activity is older than
the period, and leaves the attendance rows in place so hours and who-was-on-site
can still be produced.

A worker currently signed in is never stripped, even if their record is old.
A record with no usable date is left alone. Someone already anonymised is
skipped. Signatures on their inductions are cleared with the rest of the
personal data. The `AnonymisedAt` columns are created in NocoDB on first use.

Add a monthly task in the same scheduler (the first of the month at 3am suits):

```bash
curl -fsS -X POST https://<host>/api/cron/retention \
  -H "Authorization: Bearer $CRON_SECRET"
```

Preview with `?dryRun=1`. Same secret and admin-session fallback as auto-close.

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