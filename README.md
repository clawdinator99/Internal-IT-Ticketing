# Simple Internal IT Ticketing Tool (MVP)

Built from your PRD (Phase 1 focus):
- Public no-login ticket submission
- Auto Ticket ID + secure status link (128+ bit token)
- Public status lookup via token or Ticket ID + Employee ID
- Admin login + dashboard + ticket detail
- Status changes, assignee updates, internal notes, audit log
- Attachments upload/download (up to 10MB each)
- Basic reports + CSV export
- Rate limiting on public submit endpoint

## Run

```bash
npm install
npm start
```

Open: `http://localhost:3000`

## MySQL DB Pack

Ready-to-run MySQL files are in `db/mysql/`:
- `001_schema.sql`
- `002_indexes.sql`
- `003_seed.sql` (optional sample data)

Apply:

```bash
mysql -u <user> -p -h <host> <database> < db/mysql/001_schema.sql
mysql -u <user> -p -h <host> <database> < db/mysql/002_indexes.sql
mysql -u <user> -p -h <host> <database> < db/mysql/003_seed.sql
```

## Admin login (default)
- Username: `admin`
- Password: `admin123`

## Production env (required)
Copy `.env.example` and set strong values:
- `NODE_ENV=production`
- `ADMIN_USER`
- `ADMIN_PASS`
- `SESSION_SECRET`
- `PORT`

The app will refuse to start in production if default credentials/secrets are still set.

## Data
- SQLite DB: `data/tickets.db`
- Uploaded files: `uploads/`

## Notes vs PRD
- Implemented MVP core flow + reporting + audit trail.
- SSO/OAuth for admin is stubbed as Phase 2 (currently local auth).
- Email/Slack notifications are not wired yet (ready to add in next iteration).
- Virus scanning/CAPTCHA hooks not yet integrated; rate limiting is active.
