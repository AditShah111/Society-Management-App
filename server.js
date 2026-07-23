require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

const allowedUploadTypes = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const allowedUploadExtensions = new Set(['.pdf', '.txt', '.doc', '.docx']);

const seedData = {
  society: { wing: 'A', totalFlats: 48 },
  users: [
    { email: 'admin@society.com', password: 'admin123', role: 'super_admin' },
    { email: 'committee@society.com', password: 'committee123', role: 'society_admin' },
    { email: 'guard@society.com', password: 'guard123', role: 'gate_guard' },
    { email: 'resident@society.com', password: 'resident123', role: 'member' }
  ],
  maintenanceBills: [
    { flatNo: 'A-101', memberName: 'Rajesh Sharma', amount: 4500, status: 'Paid' },
    { flatNo: 'A-102', memberName: 'Priya Desai', amount: 9000, status: 'Overdue' },
    { flatNo: 'A-103', memberName: 'Amit Patel', amount: 4500, status: 'Pending' }
  ],
  financialRecords: [
    { date: '2026-04-10', month: 'Apr', accountHead: 'Maintenance Collection', description: 'Maintenance received from members', voucherNo: 'RV-1001', type: 'income', amount: 320000 },
    { date: '2026-04-18', month: 'Apr', accountHead: 'Repairs & Utilities', description: 'Monthly society expenditure', voucherNo: 'PV-0801', type: 'expense', amount: 180000 },
    { date: '2026-05-10', month: 'May', accountHead: 'Maintenance Collection', description: 'Maintenance received from members', voucherNo: 'RV-1002', type: 'income', amount: 310000 },
    { date: '2026-05-21', month: 'May', accountHead: 'Security, utilities and repairs', description: 'Monthly society expenditure', voucherNo: 'PV-0802', type: 'expense', amount: 210000 },
    { date: '2026-06-10', month: 'Jun', accountHead: 'Maintenance Collection', description: 'Maintenance received from members', voucherNo: 'RV-1003', type: 'income', amount: 345000 },
    { date: '2026-06-24', month: 'Jun', accountHead: 'Utilities and repairs', description: 'Monthly society expenditure', voucherNo: 'PV-0803', type: 'expense', amount: 195000 },
    { date: '2026-07-10', month: 'Jul', accountHead: 'Maintenance Collection (Bank A/c)', description: 'Maintenance received via NEFT from A-101', voucherNo: 'RV-1024', type: 'income', amount: 4500 },
    { date: '2026-07-08', month: 'Jul', accountHead: 'Repairs & Maintenance Fund', description: 'Payment made to Apex Elevators for AMC', voucherNo: 'PV-0842', type: 'expense', amount: 15000 },
    { date: '2026-07-05', month: 'Jul', accountHead: 'Sinking Fund', description: 'Mandatory statutory transfer for July', voucherNo: 'JV-0112', type: 'income', amount: 12500 }
  ],
  agmMeetings: [
    { id: 'agm-2026', title: 'Annual General Meeting 2026', date: '2026-09-30', status: 'Scheduled', agenda: 'Audit adoption, budget approval, committee updates.' },
    { id: 'sgm-2026-04', title: 'Special General Meeting', date: '2026-04-15', status: 'Minutes Finalized', agenda: 'Redevelopment and statutory compliance review.' }
  ]
};

// Database pool setup
let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
} else {
  console.warn("WARNING: DATABASE_URL not set in env. Database operations will fail.");
}

// In-memory Session Store & Helpers
const SESSIONS = new Map();

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    }
  });
  return list;
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session_token;
  if (!token) return null;
  return SESSIONS.get(token) || null;
}

// Schema Initializer
async function initializeDatabase() {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create Tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS society (
        id SERIAL PRIMARY KEY,
        wing VARCHAR(10) NOT NULL,
        total_flats INT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        email VARCHAR(255) PRIMARY KEY,
        salt VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        auth_method VARCHAR(50) DEFAULT 'password',
        otp_code VARCHAR(10),
        otp_expires_at TIMESTAMP WITH TIME ZONE,
        role VARCHAR(50) DEFAULT 'member'
      );
    `);

    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_method VARCHAR(50) DEFAULT \'password\';');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10);');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITH TIME ZONE;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT \'member\';');

    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_bills (
        flat_no VARCHAR(20) PRIMARY KEY,
        member_name VARCHAR(100) NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        status VARCHAR(50) NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_records (
        id UUID PRIMARY KEY,
        date DATE NOT NULL,
        month VARCHAR(10) NOT NULL,
        account_head VARCHAR(255) NOT NULL,
        description TEXT,
        voucher_no VARCHAR(50),
        type VARCHAR(20) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agm_meetings (
        id VARCHAR(100) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        status VARCHAR(50) NOT NULL,
        agenda TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS statutory_documents (
        id UUID PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        form_id VARCHAR(50),
        form_name VARCHAR(255),
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INT NOT NULL,
        file_data BYTEA NOT NULL,
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS registered_name VARCHAR(255) DEFAULT \'Lotus Co-operative Housing Society Ltd.\';');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS registration_no VARCHAR(100) DEFAULT \'MUM/WP/HSG/TC/12345/2026\';');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS address TEXT DEFAULT \'Plot 42, Sector 15, Vashi, Navi Mumbai, Maharashtra 400703\';');

    await client.query(`
      CREATE TABLE IF NOT EXISTS redevelopment_stages (
        stage_id INT PRIMARY KEY,
        stage_name VARCHAR(100) NOT NULL,
        sub_text VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        completed_at TIMESTAMP WITH TIME ZONE
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS redevelopment_tenders (
        id UUID PRIMARY KEY,
        builder_name VARCHAR(255) UNIQUE NOT NULL,
        extra_area_pct NUMERIC(5,2) NOT NULL,
        corpus_amount_lakhs NUMERIC(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'Under Review'
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id UUID PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        member_name VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'Open',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Enable Row Level Security (RLS) to lock down the tables against direct Supabase REST API calls
    await client.query('ALTER TABLE society ENABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE users ENABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE maintenance_bills ENABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE financial_records ENABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE agm_meetings ENABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE statutory_documents ENABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE redevelopment_stages ENABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE redevelopment_tenders ENABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;');

    // Seed Data check & insertion
    const socCount = await client.query('SELECT count(*) FROM society');
    if (parseInt(socCount.rows[0].count) === 0) {
      await client.query('INSERT INTO society (wing, total_flats, registered_name, registration_no, address) VALUES ($1, $2, $3, $4, $5)', [
        seedData.society.wing,
        seedData.society.totalFlats,
        'Lotus Co-operative Housing Society Ltd.',
        'MUM/WP/HSG/TC/12345/2026',
        'Plot 42, Sector 15, Vashi, Navi Mumbai, Maharashtra 400703'
      ]);
    } else {
      // Ensure registration details exist in older rows
      await client.query(`
        UPDATE society SET 
          registered_name = COALESCE(registered_name, 'Lotus Co-operative Housing Society Ltd.'),
          registration_no = COALESCE(registration_no, 'MUM/WP/HSG/TC/12345/2026'),
          address = COALESCE(address, 'Plot 42, Sector 15, Vashi, Navi Mumbai, Maharashtra 400703')
      `);
    }

    const stageCount = await client.query('SELECT count(*) FROM redevelopment_stages');
    if (parseInt(stageCount.rows[0].count) === 0) {
      await client.query("INSERT INTO redevelopment_stages (stage_id, stage_name, sub_text, status) VALUES (1, 'Feasibility Report', 'Approved 79(A)', 'Completed')");
      await client.query("INSERT INTO redevelopment_stages (stage_id, stage_name, sub_text, status) VALUES (2, 'PMC Appointed', 'Arch & Co.', 'Completed')");
      await client.query("INSERT INTO redevelopment_stages (stage_id, stage_name, sub_text, status) VALUES (3, 'Tendering', 'Quotations Open', 'In Progress')");
      await client.query("INSERT INTO redevelopment_stages (stage_id, stage_name, sub_text, status) VALUES (4, 'Builder Selection', 'Pending GBM', 'Pending')");
    }

    const tenderCount = await client.query('SELECT count(*) FROM redevelopment_tenders');
    if (parseInt(tenderCount.rows[0].count) === 0) {
      await client.query("INSERT INTO redevelopment_tenders (id, builder_name, extra_area_pct, corpus_amount_lakhs, status) VALUES ($1, 'Rustomjee Developers', 35.00, 15.00, 'Under Review')", [crypto.randomUUID()]);
      await client.query("INSERT INTO redevelopment_tenders (id, builder_name, extra_area_pct, corpus_amount_lakhs, status) VALUES ($1, 'Lodha Group', 40.00, 12.00, 'Under Review')", [crypto.randomUUID()]);
    }

    const complaintCount = await client.query('SELECT count(*) FROM complaints');
    if (parseInt(complaintCount.rows[0].count) === 0) {
      await client.query("INSERT INTO complaints (id, title, description, member_name, status) VALUES ($1, 'Water leakage in Wing A elevator shaft', 'Water dripping from overhead tank', 'Ramesh Kumar', 'Open')", [crypto.randomUUID()]);
      await client.query("INSERT INTO complaints (id, title, description, member_name, status) VALUES ($1, 'Main gate intercom connection static noise', 'Intercom has crackling noise during calls', 'Suresh Patel', 'Open')", [crypto.randomUUID()]);
    }

    const userCount = await client.query('SELECT count(*) FROM users');
    if (parseInt(userCount.rows[0].count) <= 1) {
      await client.query('DELETE FROM users');
      for (const u of seedData.users) {
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = crypto.scryptSync(u.password, salt, 64).toString('hex');
        await client.query(
          'INSERT INTO users (email, salt, password_hash, role) VALUES ($1, $2, $3, $4)',
          [u.email, salt, passwordHash, u.role]
        );
      }
    }

    const billCount = await client.query('SELECT count(*) FROM maintenance_bills');
    if (parseInt(billCount.rows[0].count) === 0) {
      for (const b of seedData.maintenanceBills) {
        await client.query('INSERT INTO maintenance_bills (flat_no, member_name, amount, status) VALUES ($1, $2, $3, $4)', [b.flatNo, b.memberName, b.amount, b.status]);
      }
    }

    const recCount = await client.query('SELECT count(*) FROM financial_records');
    if (parseInt(recCount.rows[0].count) === 0) {
      for (const r of seedData.financialRecords) {
        const id = crypto.randomUUID();
        await client.query(
          `INSERT INTO financial_records (id, date, month, account_head, description, voucher_no, type, amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, r.date, r.month, r.accountHead, r.description, r.voucherNo, r.type, r.amount]
        );
      }
    }

    const agmCount = await client.query('SELECT count(*) FROM agm_meetings');
    if (parseInt(agmCount.rows[0].count) === 0) {
      for (const a of seedData.agmMeetings) {
        await client.query('INSERT INTO agm_meetings (id, title, date, status, agenda) VALUES ($1, $2, $3, $4, $5)', [a.id, a.title, a.date, a.status, a.agenda]);
      }
    }

    await client.query('COMMIT');
    console.log('Database tables verified and seeded successfully in Supabase!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database initialization/seeding failed:', error);
  } finally {
    client.release();
  }
}

async function getFullStateFromDb() {
  const state = {
    society: { wing: 'A', totalFlats: 48, registeredName: 'Lotus Co-operative Housing Society Ltd.', registrationNo: 'MUM/WP/HSG/TC/12345/2026', address: 'Plot 42, Sector 15, Vashi, Navi Mumbai, Maharashtra 400703' },
    maintenanceBills: [],
    financialRecords: [],
    agmMeetings: [],
    documents: [],
    redevelopmentStages: [],
    redevelopmentTenders: [],
    complaints: []
  };

  if (!pool) return state;

  const resSoc = await pool.query('SELECT wing, total_flats as "totalFlats", registered_name as "registeredName", registration_no as "registrationNo", address FROM society LIMIT 1');
  if (resSoc.rows[0]) state.society = resSoc.rows[0];

  const resBills = await pool.query('SELECT flat_no as "flatNo", member_name as "memberName", amount, status FROM maintenance_bills');
  state.maintenanceBills = resBills.rows.map(r => ({ ...r, amount: Number(r.amount) }));

  const resRecords = await pool.query('SELECT id, to_char(date, \'YYYY-MM-DD\') as date, month, account_head as "accountHead", description, voucher_no as "voucherNo", type, amount FROM financial_records ORDER BY date DESC, created_at DESC');
  state.financialRecords = resRecords.rows.map(r => ({ ...r, amount: Number(r.amount) }));

  const resAgm = await pool.query('SELECT id, to_char(date, \'YYYY-MM-DD\') as date, title, status, agenda FROM agm_meetings ORDER BY date ASC');
  state.agmMeetings = resAgm.rows;

  const resDocs = await pool.query('SELECT id, title, category, form_id as "formId", form_name as "formName", original_name as "originalName", mime_type as "mimeType", file_size as "size", to_char(uploaded_at, \'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"\') as "uploadedAt" FROM statutory_documents ORDER BY uploaded_at DESC');
  state.documents = resDocs.rows.map(r => ({
    ...r,
    url: `/uploads/${r.id}`
  }));

  const resStages = await pool.query('SELECT stage_id as "id", stage_name as "name", sub_text as "subText", status, to_char(completed_at, \'YYYY-MM-DD\') as "completedAt" FROM redevelopment_stages ORDER BY stage_id ASC');
  state.redevelopmentStages = resStages.rows;

  const resTenders = await pool.query('SELECT id, builder_name as "builderName", extra_area_pct as "extraAreaPct", corpus_amount_lakhs as "corpusAmountLakhs", status FROM redevelopment_tenders ORDER BY extra_area_pct DESC');
  state.redevelopmentTenders = resTenders.rows.map(r => ({
    ...r,
    extraAreaPct: Number(r.extraAreaPct),
    corpusAmountLakhs: Number(r.corpusAmountLakhs)
  }));

  const resComplaints = await pool.query('SELECT id, title, description, member_name as "memberName", status FROM complaints');
  state.complaints = resComplaints.rows;

  return state;
}

const loginAttemptMap = new Map();
function isLoginRateLimited(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 10;
  const attempts = (loginAttemptMap.get(ip) || []).filter(t => now - t < windowMs);
  if (attempts.length >= maxAttempts) return true;
  attempts.push(now);
  loginAttemptMap.set(ip, attempts);
  return false;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const securityHeaders = {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-xss-protection': '1; mode=block',
    'referrer-policy': 'strict-origin-when-cross-origin'
  };
  res.writeHead(status, Object.assign(securityHeaders, extraHeaders));
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const body = await readBody(req);
  return body.length ? JSON.parse(body.toString('utf8')) : {};
}

function deriveDashboard(data) {
  const unpaid = data.maintenanceBills.filter(bill => bill.status.toLowerCase() !== 'paid');
  const currentMonth = new Date().toLocaleString('en-US', { month: 'short' });
  const mtdCollection = data.financialRecords
    .filter(record => record.month === currentMonth && record.type === 'income')
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const outstandingDues = unpaid.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  
  const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  const chart = months.map(month => {
    const records = data.financialRecords.filter(record => record.month === month);
    return {
      month,
      income: records.filter(record => record.type === 'income').reduce((sum, record) => sum + Number(record.amount || 0), 0),
      expense: records.filter(record => record.type === 'expense').reduce((sum, record) => sum + Number(record.amount || 0), 0)
    };
  });
  
  const upcomingAgm = data.agmMeetings
    .filter(meeting => new Date(meeting.date) >= new Date('2026-07-18'))
    .sort((a, b) => a.date.localeCompare(b.date))[0] || data.agmMeetings[0];

  return {
    totalFlats: data.society.totalFlats,
    mtdCollection,
    outstandingDues,
    activeComplaints: data.complaints ? data.complaints.filter(c => c.status.toLowerCase() === 'open').length : 0,
    chart,
    upcomingAgm
  };
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return {};
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const parts = {};
  let offset = 0;

  while ((offset = buffer.indexOf(boundary, offset)) !== -1) {
    const next = buffer.indexOf(boundary, offset + boundary.length);
    if (next === -1) break;
    const part = buffer.subarray(offset + boundary.length + 2, next - 2);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) {
      offset = next;
      continue;
    }

    const rawHeaders = part.subarray(0, headerEnd).toString('utf8');
    const content = part.subarray(headerEnd + 4);
    const name = /name="([^"]+)"/.exec(rawHeaders)?.[1];
    if (!name) {
      offset = next;
      continue;
    }

    const filename = /filename="([^"]*)"/.exec(rawHeaders)?.[1];
    const type = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders)?.[1]?.trim() || 'application/octet-stream';
    parts[name] = filename ? { filename, type, content } : content.toString('utf8');
    offset = next;
  }

  return parts;
}

async function handleUpload(req, res) {
  try {
    const parts = parseMultipart(await readBody(req), req.headers['content-type'] || '');
    const file = parts.file;
    if (!file || !file.filename) return sendJson(res, 400, { error: 'A file field is required.' });

    const originalName = path.basename(file.filename).replace(/[^\w.\- ]+/g, '_');
    const extension = path.extname(originalName).toLowerCase();
    if (!allowedUploadTypes.has(file.type) && !allowedUploadExtensions.has(extension)) {
      return sendJson(res, 415, { error: 'Only PDF, Word and plain text files are allowed.' });
    }

    if (file.content.length > 2 * 1024 * 1024) {
      return sendJson(res, 413, { error: 'File size exceeds the 2MB database storage limit.' });
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO statutory_documents (id, title, category, form_id, form_name, original_name, mime_type, file_size, file_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        parts.title || originalName,
        parts.category || 'General',
        parts.formId || '',
        parts.formName || '',
        originalName,
        file.type,
        file.content.length,
        file.content
      ]
    );

    const db = await getFullStateFromDb();
    const document = db.documents.find(doc => doc.id === id);
    sendJson(res, 201, { document, dashboard: deriveDashboard(db) });
  } catch (error) {
    sendJson(res, 500, { error: `Upload processing failed: ${error.message}` });
  }
}

async function handleDeleteDocument(req, res, documentId) {
  try {
    const result = await pool.query('DELETE FROM statutory_documents WHERE id::text = $1 RETURNING id, title', [documentId]);
    if (result.rows.length === 0) {
      return sendJson(res, 404, { error: 'Document not found.' });
    }

    const db = await getFullStateFromDb();
    sendJson(res, 200, { deleted: result.rows[0], dashboard: deriveDashboard(db) });
  } catch (error) {
    sendJson(res, 500, { error: `Delete failed: ${error.message}` });
  }
}

async function handleApi(req, res, url) {
  try {
    // 0. Cloud Health & Liveness Probe
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, {
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        database: pool ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
      });
    }

    // 1. Authentication Endpoints
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const clientIp = req.socket.remoteAddress || '127.0.0.1';
      if (isLoginRateLimited(clientIp)) {
        return sendJson(res, 429, { error: 'Too many authentication attempts. Please try again after 15 minutes.' });
      }
      const { email, password } = await readJsonBody(req);
      if (!email || !password) {
        return sendJson(res, 400, { error: 'Email and password are required.' });
      }

      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      const result = await pool.query('SELECT salt, password_hash, role FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      const user = result.rows[0];
      if (!user) {
        return sendJson(res, 401, { error: 'Invalid email or password.' });
      }

      const hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
      if (hash !== user.password_hash) {
        return sendJson(res, 401, { error: 'Invalid email or password.' });
      }

      const token = crypto.randomUUID();
      SESSIONS.set(token, { email, role: user.role, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });

      res.writeHead(200, {
        'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400`,
        'content-type': 'application/json; charset=utf-8'
      });
      return res.end(JSON.stringify({ success: true, user: { email, role: user.role } }));
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/send-otp') {
      const { email } = await readJsonBody(req);
      if (!email) {
        return sendJson(res, 400, { error: 'Email is required.' });
      }
      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry
      
      const exists = await pool.query('SELECT email FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (exists.rows.length === 0) {
        // Auto-register new resident/user for dynamic access
        const dummySalt = crypto.randomBytes(16).toString('hex');
        const dummyHash = crypto.scryptSync(crypto.randomUUID(), dummySalt, 64).toString('hex');
        await pool.query(
          'INSERT INTO users (email, salt, password_hash, auth_method, otp_code, otp_expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [email, dummySalt, dummyHash, 'otp', otp, expiresAt]
        );
      } else {
        await pool.query(
          'UPDATE users SET otp_code = $1, otp_expires_at = $2, auth_method = \'otp\' WHERE LOWER(email) = LOWER($3)',
          [otp, expiresAt, email]
        );
      }

      console.log(`[AUTH-OTP] Generated passcode ${otp} for resident ${email}`);
      return sendJson(res, 200, { success: true, message: 'OTP passcode generated successfully.', otp }); // returns otp directly for simulation
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
      const { email, code } = await readJsonBody(req);
      if (!email || !code) {
        return sendJson(res, 400, { error: 'Email and verification code are required.' });
      }
      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      const result = await pool.query('SELECT otp_code, otp_expires_at, role FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      const user = result.rows[0];
      if (!user || user.otp_code !== code || new Date(user.otp_expires_at) < new Date()) {
        return sendJson(res, 401, { error: 'Invalid or expired passcode. Please request a new one.' });
      }

      // Clear OTP on success
      await pool.query('UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE LOWER(email) = LOWER($1)', [email]);

      const token = crypto.randomUUID();
      SESSIONS.set(token, { email, role: user.role, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });

      res.writeHead(200, {
        'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400`,
        'content-type': 'application/json; charset=utf-8'
      });
      return res.end(JSON.stringify({ success: true, user: { email, role: user.role } }));
    }

    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies.session_token;
      if (token) {
        SESSIONS.delete(token);
      }
      res.writeHead(200, {
        'Set-Cookie': `session_token=; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
        'content-type': 'application/json; charset=utf-8'
      });
      return res.end(JSON.stringify({ success: true }));
    }

    // 2. Protect all other API endpoints
    const session = getSession(req);
    if (!session || session.expiresAt < Date.now()) {
      if (session) {
        const cookies = parseCookies(req.headers.cookie);
        SESSIONS.delete(cookies.session_token);
      }
      return sendJson(res, 401, { error: 'Unauthorized' });
    }

    // Role-Based Access Control (RBAC) - Block non-admin mutations
    if (['POST', 'DELETE', 'PUT'].includes(req.method)) {
      if (session.role !== 'super_admin' && session.role !== 'society_admin') {
        return sendJson(res, 403, { error: 'Forbidden: Admin authorization is required to modify backend data.' });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      const db = await getFullStateFromDb();
      return sendJson(res, 200, { 
        ...db, 
        dashboard: deriveDashboard(db),
        currentUser: { email: session.email, role: session.role }
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/financial-records') {
      const payload = await readJsonBody(req);
      const { date, month, accountHead, description, voucherNo, type, amount } = payload;
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO financial_records (id, date, month, account_head, description, voucher_no, type, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, date, month, accountHead, description, voucherNo || '', type, Number(amount || 0)]
      );

      const db = await getFullStateFromDb();
      return sendJson(res, 201, { record: { id, ...payload, amount: Number(amount) }, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/agm-meetings') {
      const payload = await readJsonBody(req);
      const { title, date, status, agenda } = payload;
      const id = `meet-${Date.now()}`;
      await pool.query(
        `INSERT INTO agm_meetings (id, title, date, status, agenda)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, title, date, status, agenda || '']
      );

      const db = await getFullStateFromDb();
      return sendJson(res, 201, { meeting: { id, ...payload }, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/documents') {
      return handleUpload(req, res);
    }

    const documentDeleteMatch = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
    if (req.method === 'DELETE' && documentDeleteMatch) {
      return handleDeleteDocument(req, res, decodeURIComponent(documentDeleteMatch[1]));
    }

    sendJson(res, 404, { error: 'API route not found.' });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function serveStatic(req, res, url) {
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.normalize(path.join(ROOT, requested));
  if (!target.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const data = await fs.readFile(target);
    const type = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  
  // Secure access to local static uploads directory
  if (url.pathname.startsWith('/uploads/')) {
    const session = getSession(req);
    if (!session || session.expiresAt < Date.now()) {
      res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    // Serve binary file from statutory_documents table in Supabase
    const docId = url.pathname.slice('/uploads/'.length);
    try {
      const result = await pool.query('SELECT mime_type, file_data FROM statutory_documents WHERE id::text = $1', [docId]);
      if (result.rows.length === 0) {
        res.writeHead(404);
        return res.end('Document not found');
      }
      const { mime_type, file_data } = result.rows[0];
      res.writeHead(200, {
        'content-type': mime_type,
        'content-length': file_data.length,
        'cache-control': 'private, max-age=86400'
      });
      return res.end(file_data);
    } catch (err) {
      res.writeHead(500);
      return res.end(`Database error: ${err.message}`);
    }
  }
  
  return serveStatic(req, res, url);
});

// Initialize database tables, seed data, and start server
if (pool) {
  initializeDatabase().then(() => {
    server.listen(PORT, () => {
      console.log(`Society Management System running at http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error("Critical database startup error:", err);
  });
} else {
  server.listen(PORT, () => {
    console.log(`Society Management System running (No Database Mode) at http://localhost:${PORT}`);
  });
}

// Graceful Shutdown for Cloud Platforms (Render, AWS, GCP)
function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    if (pool) {
      await pool.end();
      console.log('Database pool drained.');
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

