-- Performance indexes for common ticketing queries

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_tickets_updated_at ON tickets(updated_at);
CREATE INDEX idx_tickets_category ON tickets(category);
CREATE INDEX idx_tickets_department ON tickets(department);
CREATE INDEX idx_tickets_employee_id ON tickets(employee_id);
CREATE INDEX idx_tickets_assignee ON tickets(assignee);
CREATE INDEX idx_tickets_status_priority_created ON tickets(status, priority, created_at);

CREATE INDEX idx_audit_ticket_created ON audit_logs(ticket_id, created_at);
CREATE INDEX idx_notes_ticket_created ON internal_notes(ticket_id, created_at);
CREATE INDEX idx_attachments_ticket_created ON attachments(ticket_id, created_at);
