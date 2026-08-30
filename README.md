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
- `SESSION_SECRET` — HMAC key for admin sessions

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