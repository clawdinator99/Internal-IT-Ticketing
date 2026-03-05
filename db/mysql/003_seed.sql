-- Minimal seed data for local validation

INSERT INTO tickets (
  ticket_id, secure_status_token, created_at, updated_at,
  submitter_name, employee_id, email, department, location,
  category, subcategory, priority, summary, description, status,
  assignee, sla_due_at, first_response_at, resolved_at
)
VALUES
(
  'IT-2026-0001',
  '9f8e93b25ea8452fa5b7fe872e1f5f50f4e9f74c92a9e34dca4eb7f5eb74e2a1',
  UTC_TIMESTAMP(), UTC_TIMESTAMP(),
  'Tony Stark', 'EMP-1001', 'tony@example.com', 'Engineering', 'HQ Floor 3',
  'Hardware', 'Laptop', 'High',
  'Laptop overheating',
  'Laptop fan is running continuously and system throttles after 10 mins.',
  'New',
  NULL, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), NULL, NULL
),
(
  'IT-2026-0002',
  'cd8d912f6a08421ca2b16b2ca4f9f330c8e8c3363aa66de0493ea5f4f55de82d',
  UTC_TIMESTAMP(), UTC_TIMESTAMP(),
  'Pepper Potts', 'EMP-1002', 'pepper@example.com', 'Operations', 'HQ Floor 5',
  'Access', 'VPN', 'Medium',
  'VPN login failing',
  'Unable to connect to corporate VPN from home network.',
  'In Progress',
  'IT-Agent-1', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR), UTC_TIMESTAMP(), NULL
);

INSERT INTO internal_notes (ticket_id, author, note, created_at)
VALUES
('IT-2026-0002', 'IT-Agent-1', 'Validated credentials, investigating gateway logs.', UTC_TIMESTAMP());

INSERT INTO audit_logs (ticket_id, actor, action, from_value, to_value, note, created_at)
VALUES
('IT-2026-0001', 'system', 'ticket_created', NULL, 'New', 'Ticket submitted via web form', UTC_TIMESTAMP()),
('IT-2026-0002', 'system', 'ticket_created', NULL, 'New', 'Ticket submitted via web form', UTC_TIMESTAMP()),
('IT-2026-0002', 'IT-Agent-1', 'status_changed', 'New', 'In Progress', 'Started troubleshooting', UTC_TIMESTAMP());
