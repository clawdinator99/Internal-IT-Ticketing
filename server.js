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
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-now';

const DB_CLIENT = (process.env.DB_CLIENT || 'sqlite').toLowerCase();
const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER;
const DB_PASS = process.env.DB_PASS;
const DB_NAME = process.env.DB_NAME || 'it_ticketing';

if (IS_PROD && (ADMIN_USER === 'admin' || ADMIN_PASS === 'admin123' || SESSION_SECRET === 'change-me-now')) {
  throw new Error('Refusing to start in production with default ADMIN_USER/ADMIN_PASS/SESSION_SECRET. Set strong env vars.');
}

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

let sqlite = null;
let mysqlPool = null;

async function initDb() {
  if (DB_CLIENT === 'mysql') {
    if (!DB_HOST || !DB_USER || !DB_PASS || !DB_NAME) {
      throw new Error('Missing MySQL env vars. Required: DB_HOST, DB_USER, DB_PASS, DB_NAME');
    }

    mysqlPool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        ticket_id VARCHAR(32) NOT NULL UNIQUE,
        secure_status_token CHAR(64) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        submitter_name VARCHAR(120) NOT NULL,
        employee_id VARCHAR(64) NOT NULL,
        email VARCHAR(255) NULL,
        department VARCHAR(120) NOT NULL,
        location VARCHAR(160) NOT NULL,
        category VARCHAR(120) NOT NULL,
        subcategory VARCHAR(120) NULL,
        priority VARCHAR(20) NOT NULL,
        summary VARCHAR(255) NOT NULL,
        description MEDIUMTEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'New',
        assignee VARCHAR(120) NULL,
        sla_due_at DATETIME NULL,
        first_response_at DATETIME NULL,
        resolved_at DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        ticket_id VARCHAR(32) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(120) NULL,
        size BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL,
        INDEX idx_attachments_ticket_id (ticket_id),
        CONSTRAINT fk_attachments_ticket FOREIGN KEY (ticket_id)
          REFERENCES tickets(ticket_id) ON UPDATE CASCADE ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        ticket_id VARCHAR(32) NOT NULL,
        actor VARCHAR(120) NOT NULL,
        action VARCHAR(120) NOT NULL,
        from_value TEXT NULL,
        to_value TEXT NULL,
        note TEXT NULL,
        created_at DATETIME NOT NULL,
        INDEX idx_audit_ticket_id (ticket_id),
        CONSTRAINT fk_audit_ticket FOREIGN KEY (ticket_id)
          REFERENCES tickets(ticket_id) ON UPDATE CASCADE ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS internal_notes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        ticket_id VARCHAR(32) NOT NULL,
        author VARCHAR(120) NOT NULL,
        note TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        INDEX idx_notes_ticket_id (ticket_id),
        CONSTRAINT fk_notes_ticket FOREIGN KEY (ticket_id)
          REFERENCES tickets(ticket_id) ON UPDATE CASCADE ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('DB: MySQL connected');
    return;
  }

  sqlite = new Database(path.join(dataDir, 'tickets.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(`
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
  console.log('DB: SQLite connected');
}

function toDbTs(d = new Date()) {
  return dayjs(d).format('YYYY-MM-DD HH:mm:ss');
}

async function dbGet(sql, params = []) {
  if (DB_CLIENT === 'mysql') {
    const [rows] = await mysqlPool.query(sql, params);
    return rows[0] || null;
  }
  return sqlite.prepare(sql).get(...params);
}

async function dbAll(sql, params = []) {
  if (DB_CLIENT === 'mysql') {
    const [rows] = await mysqlPool.query(sql, params);
    return rows;
  }
  return sqlite.prepare(sql).all(...params);
}

async function dbRun(sql, params = []) {
  if (DB_CLIENT === 'mysql') {
    const [res] = await mysqlPool.query(sql, params);
    return res;
  }
  return sqlite.prepare(sql).run(...params);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/submit', publicLimiter);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname))
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

async function ticketId() {
  const year = dayjs().format('YYYY');
  const row = await dbGet('SELECT COUNT(*) AS c FROM tickets');
  const seq = String((row?.c || 0) + 1).padStart(4, '0');
  return `IT-${year}-${seq}`;
}

function statusToken() { return crypto.randomBytes(32).toString('hex'); }

function authRequired(req, res, next) {
  const t = req.cookies.admin_session;
  if (!t) return res.redirect('/admin/login');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`${ADMIN_USER}:session`).digest('hex');
  if (t !== expected) return res.redirect('/admin/login');
  next();
}

async function addAudit(ticket, actor, action, fromValue = null, toValue = null, note = null) {
  await dbRun('INSERT INTO audit_logs (ticket_id, actor, action, from_value, to_value, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [ticket, actor, action, fromValue, toValue, note, toDbTs()]);
}

function fmt(ts) {
  if (!ts) return '-';
  let d;
  if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)) {
    d = new Date(ts.replace(' ', 'T') + 'Z'); // MySQL DATETIME stored as UTC
  } else {
    d = new Date(ts);
  }
  if (Number.isNaN(d.getTime())) return String(ts);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(d) + ' IST';
}

app.get('/', (_, res) => res.redirect('/submit'));
app.get('/submit', (_, res) => res.render('submit', { error: null, values: {} }));

app.post('/submit', upload.array('attachments', 3), async (req, res) => {
  try {
    const required = ['submitter_name', 'employee_id', 'email', 'category', 'priority', 'summary', 'description'];
    for (const f of required) if (!req.body[f] || !String(req.body[f]).trim()) return res.status(400).render('submit', { error: `Missing required field: ${f}`, values: req.body });

    const now = toDbTs();
    const id = await ticketId();
    const token = statusToken();
    const slaDue = toDbTs(dayjs().add(req.body.priority === 'High' ? 4 : req.body.priority === 'Medium' ? 8 : 24, 'hour').toDate());

    await dbRun(`INSERT INTO tickets (
      ticket_id, secure_status_token, created_at, updated_at, submitter_name, employee_id, email,
      department, location, category, subcategory, priority, summary, description, status, sla_due_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?)`,
      [id, token, now, now, req.body.submitter_name.trim(), req.body.employee_id.trim(), (req.body.email || '').trim(), 'General', 'Unspecified', req.body.category, null, req.body.priority, req.body.summary.trim(), req.body.description.trim(), slaDue]);

    for (const f of (req.files || [])) {
      await dbRun('INSERT INTO attachments (ticket_id, original_name, stored_name, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, f.originalname, f.filename, f.mimetype, f.size, now]);
    }

    await addAudit(id, 'system', 'ticket_created', null, 'New', 'Ticket submitted via public form');
    const statusUrl = `${req.protocol}://${req.get('host')}/status/${token}`;
    res.render('success', { ticketId: id, statusUrl, shortToken: token.slice(0, 8) });
  } catch (err) {
    res.status(500).render('submit', { error: err.message || 'Something failed', values: req.body || {} });
  }
});

app.get('/status', (_, res) => res.render('status_lookup', { ticket: null, error: null, fmt }));
app.post('/status', async (req, res) => {
  const { ticket_id, employee_id } = req.body;
  const ticket = await dbGet('SELECT * FROM tickets WHERE ticket_id = ? AND employee_id = ?', [ticket_id, employee_id]);
  if (!ticket) return res.status(404).render('status_lookup', { ticket: null, error: 'Ticket not found. Check Ticket ID and Employee ID.', fmt });
  const audit = await dbAll('SELECT * FROM audit_logs WHERE ticket_id = ? ORDER BY created_at DESC', [ticket.ticket_id]);
  const attachments = await dbAll('SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at DESC', [ticket.ticket_id]);
  res.render('status_lookup', { ticket: { ...ticket, audit, attachments }, error: null, fmt });
});

app.get('/status/:token', async (req, res) => {
  const ticket = await dbGet('SELECT * FROM tickets WHERE secure_status_token = ?', [req.params.token]);
  if (!ticket) return res.status(404).send('Invalid or expired status link.');
  const audit = await dbAll('SELECT * FROM audit_logs WHERE ticket_id = ? ORDER BY created_at DESC', [ticket.ticket_id]);
  const attachments = await dbAll('SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at DESC', [ticket.ticket_id]);
  res.render('status_page', { ticket: { ...ticket, audit, attachments }, fmt });
});

app.get('/admin/login', (_, res) => res.render('admin_login', { error: null }));
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) return res.status(401).render('admin_login', { error: 'Invalid credentials' });
  const token = crypto.createHmac('sha256', SESSION_SECRET).update(`${ADMIN_USER}:session`).digest('hex');
  res.cookie('admin_session', token, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 12 * 60 * 60 * 1000 });
  res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => { res.clearCookie('admin_session'); res.redirect('/admin/login'); });

app.get('/admin', authRequired, async (req, res) => {
  const filters = { status: req.query.status || '', category: req.query.category || '', priority: req.query.priority || '', q: req.query.q || '' };
  let sql = 'SELECT * FROM tickets WHERE 1=1';
  const params = [];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters.category) { sql += ' AND category = ?'; params.push(filters.category); }
  if (filters.priority) { sql += ' AND priority = ?'; params.push(filters.priority); }
  if (filters.q) { sql += ' AND (ticket_id LIKE ? OR summary LIKE ? OR submitter_name LIKE ?)'; params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`); }
  sql += ' ORDER BY created_at DESC';

  const tickets = await dbAll(sql, params);
  const stats = await dbAll('SELECT category, COUNT(*) as count FROM tickets GROUP BY category');
  const total = await dbGet('SELECT COUNT(*) AS c FROM tickets');
  const high = await dbGet("SELECT COUNT(*) AS c FROM tickets WHERE priority = 'High'");
  const inProgress = await dbGet("SELECT COUNT(*) AS c FROM tickets WHERE status = 'In Progress'");
  const resolved = await dbGet("SELECT COUNT(*) AS c FROM tickets WHERE status IN ('Resolved', 'Closed')");
  res.render('admin_dashboard', { tickets, filters, stats, kpi: { total: total.c, high: high.c, inProgress: inProgress.c, resolved: resolved.c }, fmt });
});

app.get('/admin/ticket/:ticketId', authRequired, async (req, res) => {
  const ticket = await dbGet('SELECT * FROM tickets WHERE ticket_id = ?', [req.params.ticketId]);
  if (!ticket) return res.status(404).send('Ticket not found');
  const audit = await dbAll('SELECT * FROM audit_logs WHERE ticket_id = ? ORDER BY created_at DESC', [ticket.ticket_id]);
  const notes = await dbAll('SELECT * FROM internal_notes WHERE ticket_id = ? ORDER BY created_at DESC', [ticket.ticket_id]);
  const attachments = await dbAll('SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at DESC', [ticket.ticket_id]);
  res.render('admin_ticket', { ticket, audit, notes, attachments, fmt });
});

app.post('/admin/ticket/:ticketId/update', authRequired, async (req, res) => {
  const t = await dbGet('SELECT * FROM tickets WHERE ticket_id = ?', [req.params.ticketId]);
  if (!t) return res.status(404).send('Ticket not found');

  const now = toDbTs();
  const status = req.body.status || t.status;
  const note = (req.body.note || '').trim();

  await dbRun('UPDATE tickets SET status = ?, updated_at = ?, first_response_at = COALESCE(first_response_at, ?) WHERE ticket_id = ?', [status, now, now, t.ticket_id]);
  if (status !== t.status) await addAudit(t.ticket_id, 'admin', 'status_changed', t.status, status, note || null);
  if (note) {
    await dbRun('INSERT INTO internal_notes (ticket_id, author, note, created_at) VALUES (?, ?, ?, ?)', [t.ticket_id, 'admin', note, now]);
    await addAudit(t.ticket_id, 'admin', 'internal_note_added', null, null, note);
  }
  if (status === 'Resolved' && !t.resolved_at) await dbRun('UPDATE tickets SET resolved_at = ? WHERE ticket_id = ?', [now, t.ticket_id]);
  res.redirect(`/admin/ticket/${t.ticket_id}`);
});

app.get('/admin/reports', authRequired, async (_, res) => res.status(404).send('Not found'));
app.get('/admin/export.csv', authRequired, async (_, res) => res.status(404).send('Not found'));

initDb().then(() => {
  app.listen(PORT, () => console.log(`IT ticketing tool running on http://localhost:${PORT} (db=${DB_CLIENT})`));
}).catch((err) => {
  console.error('Failed to initialize DB:', err.message);
  process.exit(1);
});
