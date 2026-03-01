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

## Admin login (default)
- Username: `admin`
- Password: `admin123`

Set env vars in production:
- `ADMIN_USER`
- `ADMIN_PASS`
- `SESSION_SECRET`
- `PORT`

## Data
- SQLite DB: `data/tickets.db`
- Uploaded files: `uploads/`

## Notes vs PRD
- Implemented MVP core flow + reporting + audit trail.
- SSO/OAuth for admin is stubbed as Phase 2 (currently local auth).
- Email/Slack notifications are not wired yet (ready to add in next iteration).
- Virus scanning/CAPTCHA hooks not yet integrated; rate limiting is active.
