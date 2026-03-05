-- IT Ticketing Tool - MySQL Schema
-- Compatible with MySQL 8+

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id VARCHAR(32) NOT NULL,
  secure_status_token CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  submitter_name VARCHAR(120) NOT NULL,
  employee_id VARCHAR(64) NOT NULL,
  email VARCHAR(255) NULL,
  department VARCHAR(120) NOT NULL,
  location VARCHAR(160) NOT NULL,
  category VARCHAR(120) NOT NULL,
  subcategory VARCHAR(120) NULL,
  priority ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
  summary VARCHAR(255) NOT NULL,
  description MEDIUMTEXT NOT NULL,
  status ENUM('New','In Progress','On Hold','Resolved','Closed') NOT NULL DEFAULT 'New',
  assignee VARCHAR(120) NULL,
  sla_due_at DATETIME NULL,
  first_response_at DATETIME NULL,
  resolved_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tickets_ticket_id (ticket_id),
  UNIQUE KEY uq_tickets_secure_status_token (secure_status_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id VARCHAR(32) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  size BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_attachments_ticket_id (ticket_id),
  CONSTRAINT fk_attachments_ticket FOREIGN KEY (ticket_id)
    REFERENCES tickets(ticket_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id VARCHAR(32) NOT NULL,
  actor VARCHAR(120) NOT NULL,
  action VARCHAR(120) NOT NULL,
  from_value TEXT NULL,
  to_value TEXT NULL,
  note TEXT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_audit_ticket_id (ticket_id),
  CONSTRAINT fk_audit_ticket FOREIGN KEY (ticket_id)
    REFERENCES tickets(ticket_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS internal_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id VARCHAR(32) NOT NULL,
  author VARCHAR(120) NOT NULL,
  note TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_notes_ticket_id (ticket_id),
  CONSTRAINT fk_notes_ticket FOREIGN KEY (ticket_id)
    REFERENCES tickets(ticket_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
