const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const dayjs = require('dayjs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-now';

if (IS_PROD && (ADMIN_USER === 'admin' || ADMIN_PASS === 'admin123' || SESSION_SECRET === 'change-me-now')) {
  throw new Error('Refusing to start in production with default ADMIN_USER/ADMIN_PASS/SESSION_SECRET. Set strong env vars.');
}

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const db = new Database(path.join(dataDir, 'tickets.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT UNIQUE NOT NULL,
  secure_status_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitter_name TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  email TEXT,
  department TEXT NOT NULL,
  location TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  priority TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  assignee TEXT,
  sla_due_at TEXT,
  first_response_at TEXT,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS internal_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  author TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/submit', publicLimiter);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    const safe = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/pdf', 'application/zip'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Unsupported file type'));
    cb(null, true);
  }
});

function ticketId() {
  const year = dayjs().format('YYYY');
  const row = db.prepare('SELECT COUNT(*) AS c FROM tickets').get();
  const seq = String((row.c || 0) + 1).padStart(4, '0');
  return `IT-${year}-${seq}`;
}

function statusToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authRequired(req, res, next) {
  const t = req.cookies.admin_session;
  if (!t) return res.redirect('/admin/login');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`${ADMIN_USER}:session`).digest('hex');
  if (t !== expected) return res.redirect('/admin/login');
  next();
}

function addAudit(ticket, actor, action, fromValue = null, toValue = null, note = null) {
  db.prepare(`INSERT INTO audit_logs (ticket_id, actor, action, from_value, to_value, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(ticket, actor, action, fromValue, toValue, note, new Date().toISOString());
}

function fmt(ts) {
  if (!ts) return '-';
  return dayjs(ts).format('DD MMM YYYY, h:mm A');
}

app.get('/', (_, res) => res.redirect('/submit'));

app.get('/submit', (_, res) => {
  res.render('submit', { error: null, values: {} });
});

app.post('/submit', upload.array('attachments', 3), (req, res) => {
  try {
    const required = ['submitter_name', 'employee_id', 'email', 'category', 'priority', 'summary', 'description'];
    for (const f of required) {
      if (!req.body[f] || !String(req.body[f]).trim()) {
        return res.status(400).render('submit', { error: `Missing required field: ${f}`, values: req.body });
      }
    }

    const now = new Date().toISOString();
    const id = ticketId();
    const token = statusToken();
    const slaDue = dayjs().add(req.body.priority === 'High' ? 4 : req.body.priority === 'Medium' ? 8 : 24, 'hour').toISOString();

    db.prepare(`INSERT INTO tickets (
      ticket_id, secure_status_token, created_at, updated_at, submitter_name, employee_id, email,
      department, location, category, subcategory, priority, summary, description, status, sla_due_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?)`)
      .run(
        id,
        token,
        now,
        now,
        req.body.submitter_name.trim(),
        req.body.employee_id.trim(),
        (req.body.email || '').trim(),
        'General',
        'Unspecified',
        req.body.category,
        null,
        req.body.priority,
        req.body.summary.trim(),
        req.body.description.trim(),
        slaDue
      );

    (req.files || []).forEach((f) => {
      db.prepare(`INSERT INTO attachments (ticket_id, original_name, stored_name, mime_type, size, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, f.originalname, f.filename, f.mimetype, f.size, now);
    });

    addAudit(id, 'system', 'ticket_created', null, 'New', 'Ticket submitted via public form');

    const shortToken = token.slice(0, 8);
    const statusUrl = `${req.protocol}://${req.get('host')}/status/${token}`;
    res.render('success', { ticketId: id, statusUrl, shortToken });
  } catch (err) {
    res.status(500).render('submit', { error: err.message || 'Something failed', values: req.body || {} });
  }
});

app.get('/status', (_, res) => res.render('status_lookup', { ticket: null, error: null, fmt }));
app.post('/status', (req, res) => {
  const { ticket_id, employee_id } = req.body;
  const ticket = db.prepare('SELECT * FROM tickets WHERE ticket_id = ? AND employee_id = ?').get(ticket_id, employee_id);
  if (!ticket) return res.status(404).render('status_lookup', { ticket: null, error: 'Ticket not found. Check Ticket ID and Employee ID.', fmt });
  const audit = db.prepare('SELECT * FROM audit_logs WHERE ticket_id = ? ORDER BY created_at DESC').all(ticket.ticket_id);
  const attachments = db.prepare('SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at DESC').all(ticket.ticket_id);
  res.render('status_lookup', { ticket: { ...ticket, audit, attachments }, error: null, fmt });
});

app.get('/status/:token', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE secure_status_token = ?').get(req.params.token);
  if (!ticket) return res.status(404).send('Invalid or expired status link.');
  const audit = db.prepare('SELECT * FROM audit_logs WHERE ticket_id = ? ORDER BY created_at DESC').all(ticket.ticket_id);
  const attachments = db.prepare('SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at DESC').all(ticket.ticket_id);
  res.render('status_page', { ticket: { ...ticket, audit, attachments }, fmt });
});

app.get('/admin/login', (_, res) => res.render('admin_login', { error: null }));
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).render('admin_login', { error: 'Invalid credentials' });
  }
  const token = crypto.createHmac('sha256', SESSION_SECRET).update(`${ADMIN_USER}:session`).digest('hex');
  res.cookie('admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 12 * 60 * 60 * 1000
  });
  res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.redirect('/admin/login');
});

app.get('/admin', authRequired, (req, res) => {
  const filters = {
    status: req.query.status || '',
    category: req.query.category || '',
    priority: req.query.priority || '',
    q: req.query.q || ''
  };
  let sql = 'SELECT * FROM tickets WHERE 1=1';
  const params = [];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters.category) { sql += ' AND category = ?'; params.push(filters.category); }
  if (filters.priority) { sql += ' AND priority = ?'; params.push(filters.priority); }
  if (filters.q) { sql += ' AND (ticket_id LIKE ? OR summary LIKE ? OR submitter_name LIKE ?)'; params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`); }
  sql += ' ORDER BY created_at DESC';

  const tickets = db.prepare(sql).all(...params);
  const stats = db.prepare('SELECT category, COUNT(*) as count FROM tickets GROUP BY category').all();
  const kpi = {
    total: db.prepare('SELECT COUNT(*) AS c FROM tickets').get().c,
    high: db.prepare("SELECT COUNT(*) AS c FROM tickets WHERE priority = 'High'").get().c,
    inProgress: db.prepare("SELECT COUNT(*) AS c FROM tickets WHERE status = 'In Progress'").get().c,
    resolved: db.prepare("SELECT COUNT(*) AS c FROM tickets WHERE status IN ('Resolved', 'Closed')").get().c
  };
  res.render('admin_dashboard', { tickets, filters, stats, kpi, fmt });
});

app.get('/admin/ticket/:ticketId', authRequired, (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(req.params.ticketId);
  if (!ticket) return res.status(404).send('Ticket not found');
  const audit = db.prepare('SELECT * FROM audit_logs WHERE ticket_id = ? ORDER BY created_at DESC').all(ticket.ticket_id);
  const notes = db.prepare('SELECT * FROM internal_notes WHERE ticket_id = ? ORDER BY created_at DESC').all(ticket.ticket_id);
  const attachments = db.prepare('SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at DESC').all(ticket.ticket_id);
  res.render('admin_ticket', { ticket, audit, notes, attachments, fmt });
});

app.post('/admin/ticket/:ticketId/update', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(req.params.ticketId);
  if (!t) return res.status(404).send('Ticket not found');

  const now = new Date().toISOString();
  const status = req.body.status || t.status;
  const note = (req.body.note || '').trim();

  db.prepare('UPDATE tickets SET status = ?, updated_at = ?, first_response_at = COALESCE(first_response_at, ?) WHERE ticket_id = ?')
    .run(status, now, now, t.ticket_id);

  if (status !== t.status) addAudit(t.ticket_id, 'admin', 'status_changed', t.status, status, note || null);
  if (note) {
    db.prepare('INSERT INTO internal_notes (ticket_id, author, note, created_at) VALUES (?, ?, ?, ?)')
      .run(t.ticket_id, 'admin', note, now);
    addAudit(t.ticket_id, 'admin', 'internal_note_added', null, null, note);
  }

  if (status === 'Resolved' && !t.resolved_at) {
    db.prepare('UPDATE tickets SET resolved_at = ? WHERE ticket_id = ?').run(now, t.ticket_id);
  }

  res.redirect(`/admin/ticket/${t.ticket_id}`);
});

app.get('/admin/reports', authRequired, (_, res) => {
  const byCategory = db.prepare('SELECT category, COUNT(*) as count FROM tickets GROUP BY category ORDER BY count DESC').all();
  const kpi = db.prepare(`SELECT
      AVG((julianday(COALESCE(first_response_at, updated_at)) - julianday(created_at)) * 24) as avg_first_response_hours,
      AVG((julianday(COALESCE(resolved_at, updated_at)) - julianday(created_at)) * 24) as avg_resolution_hours
    FROM tickets`).get();
  res.render('admin_reports', { byCategory, kpi });
});

app.get('/admin/export.csv', authRequired, (_, res) => {
  const rows = db.prepare('SELECT ticket_id, submitter_name, employee_id, category, priority, status, created_at, updated_at, location FROM tickets ORDER BY created_at DESC').all();
  const header = 'ticket_id,submitter_name,employee_id,category,priority,status,created_at,updated_at,location';
  const csv = [header, ...rows.map(r => [r.ticket_id, r.submitter_name, r.employee_id, r.category, r.priority, r.status, r.created_at, r.updated_at, r.location].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="tickets.csv"');
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`IT ticketing tool running on http://localhost:${PORT}`);
});