# MySQL DB Pack for IT Ticketing Tool

This folder contains ready-to-run SQL for a MySQL deployment of the current ticketing app schema.

## Files

1. `001_schema.sql` – core tables + FK constraints
2. `002_indexes.sql` – query-performance indexes
3. `003_seed.sql` – optional sample data

## One-shot setup

```bash
mysql -u <user> -p -h <host> <database> < db/mysql/001_schema.sql
mysql -u <user> -p -h <host> <database> < db/mysql/002_indexes.sql
mysql -u <user> -p -h <host> <database> < db/mysql/003_seed.sql
```

## Notes

- Uses `utf8mb4` and InnoDB.
- Timestamps are stored in UTC (`UTC_TIMESTAMP()`).
- `ticket_id` (e.g. `IT-2026-0001`) and `secure_status_token` are unique.
- The current Node app still uses SQLite; these files are deployment-ready DB assets for MySQL.
