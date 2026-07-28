require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '1033704835291-2t1v5b1junmn6imkbssvn0ku51v4tpur.apps.googleusercontent.com';
const googleClient = new OAuth2Client(CLIENT_ID);

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
  society: {
    wing: 'A',
    totalFlats: 48,
    name: 'Lotus Co-operative Housing Society Ltd.',
    registrationNo: 'MUM/WP/HSG/TC/12345/2026'
  },
  users: [
    { email: 'ajay@gmail.com',          password: 'masterpassword', is_master_admin: true, name: 'Ajay (Master)', role: 'master_admin' },
    { email: 'admin@society.com',       password: 'admin123',       role: 'super_admin',   name: 'Society Admin' },
    { email: 'committee@society.com',   password: 'committee123',   role: 'society_admin', name: 'Committee Member' },
    { email: 'accountant@society.com',  password: 'accountant123',  role: 'accountant',    name: 'Society Accountant' },
    { email: 'resident@society.com',    password: 'resident123',    role: 'resident',      name: 'Resident Member' }
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

function invalidateOldSessions(email) {
  for (const [token, sessionData] of SESSIONS.entries()) {
    if (sessionData.email.toLowerCase() === email.toLowerCase()) {
      SESSIONS.delete(token);
    }
  }
}

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

    // ── STEP 1: Multi-tenant societies table (must exist before anything references it)
    await client.query(`
      CREATE TABLE IF NOT EXISTS societies (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(255) NOT NULL,
        registration_no VARCHAR(100) UNIQUE NOT NULL,
        status      VARCHAR(50) DEFAULT 'PENDING',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query('ALTER TABLE societies ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT \'PENDING\';');

    // ── STEP 2: Core users table (credentials only)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        email         VARCHAR(255) PRIMARY KEY,
        salt          VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        auth_method   VARCHAR(50) DEFAULT 'password',
        otp_code      VARCHAR(10),
        otp_expires_at TIMESTAMP WITH TIME ZONE,
        is_master_admin BOOLEAN DEFAULT false
      );
    `);
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_method   VARCHAR(50) DEFAULT \'password\';');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code      VARCHAR(10);');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITH TIME ZONE;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_master_admin BOOLEAN DEFAULT false;');

    // ── STEP 3: user_profiles — maps each user to a society with a role
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        email       VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
        society_id  UUID        NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
        name        VARCHAR(255),
        role        VARCHAR(50) NOT NULL DEFAULT 'resident',
        PRIMARY KEY (email, society_id)
      );
    `);

    // ── STEP 4: society metadata table (per-society settings)
    await client.query(`
      CREATE TABLE IF NOT EXISTS society (
        id              SERIAL PRIMARY KEY,
        wing            VARCHAR(10) NOT NULL,
        total_flats     INT NOT NULL,
        registered_name VARCHAR(255),
        registration_no VARCHAR(100),
        address         TEXT,
        mtd_collection  NUMERIC(15,2) DEFAULT 0,
        outstanding_dues NUMERIC(15,2) DEFAULT 0,
        active_complaints INT DEFAULT 0,
        society_id      UUID REFERENCES societies(id) ON DELETE CASCADE
      );
    `);
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS registered_name   VARCHAR(255);');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS registration_no   VARCHAR(100);');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS address           TEXT;');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS mtd_collection    NUMERIC(15,2) DEFAULT 0;');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS outstanding_dues  NUMERIC(15,2) DEFAULT 0;');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS active_complaints INT DEFAULT 0;');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS society_id        UUID;');

    // ── STEP 5: Data tables with society_id
    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_bills (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        flat_no     VARCHAR(20) NOT NULL,
        member_name VARCHAR(100) NOT NULL,
        amount      NUMERIC(10, 2) NOT NULL,
        status      VARCHAR(50) NOT NULL,
        society_id  UUID REFERENCES societies(id) ON DELETE CASCADE
      );
    `);
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();');
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS society_id UUID;');
    
    // Auto Billing & Tracker migrations
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS billing_month VARCHAR(30);');
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS bill_date DATE;');
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS due_date DATE;');
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS paid_date DATE;');
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS service_charges NUMERIC(10,2) DEFAULT 0;');
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS sinking_fund NUMERIC(10,2) DEFAULT 0;');
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS repair_fund NUMERIC(10,2) DEFAULT 0;');
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS water_charges NUMERIC(10,2) DEFAULT 0;');
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS parking_charges NUMERIC(10,2) DEFAULT 0;');

    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS rate_service NUMERIC(10,2) DEFAULT 1200;');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS rate_sinking NUMERIC(10,2) DEFAULT 300;');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS rate_repair NUMERIC(10,2) DEFAULT 500;');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS rate_water NUMERIC(10,2) DEFAULT 250;');
    await client.query('ALTER TABLE society ADD COLUMN IF NOT EXISTS rate_parking NUMERIC(10,2) DEFAULT 150;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_records (
        id          UUID PRIMARY KEY,
        date        DATE NOT NULL,
        month       VARCHAR(10) NOT NULL,
        account_head VARCHAR(255) NOT NULL,
        description TEXT,
        voucher_no  VARCHAR(50),
        type        VARCHAR(20) NOT NULL,
        amount      NUMERIC(15, 2) NOT NULL,
        society_id  UUID REFERENCES societies(id) ON DELETE CASCADE,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query('ALTER TABLE financial_records ADD COLUMN IF NOT EXISTS society_id UUID;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS agm_meetings (
        id         VARCHAR(100) PRIMARY KEY,
        title      VARCHAR(255) NOT NULL,
        date       DATE NOT NULL,
        status     VARCHAR(50) NOT NULL,
        agenda     TEXT,
        society_id UUID REFERENCES societies(id) ON DELETE CASCADE
      );
    `);
    await client.query('ALTER TABLE agm_meetings ADD COLUMN IF NOT EXISTS society_id UUID;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS statutory_documents (
        id            UUID PRIMARY KEY,
        title         VARCHAR(255) NOT NULL,
        category      VARCHAR(100) NOT NULL,
        form_id       VARCHAR(50),
        form_name     VARCHAR(255),
        original_name VARCHAR(255) NOT NULL,
        mime_type     VARCHAR(100) NOT NULL,
        file_size     INT NOT NULL,
        file_data     BYTEA NOT NULL,
        society_id    UUID REFERENCES societies(id) ON DELETE CASCADE,
        uploaded_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query('ALTER TABLE statutory_documents ADD COLUMN IF NOT EXISTS society_id UUID;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS redevelopment_stages (
        stage_id   INT,
        stage_name VARCHAR(100) NOT NULL,
        sub_text   VARCHAR(255) NOT NULL,
        status     VARCHAR(50) DEFAULT 'Pending',
        society_id UUID REFERENCES societies(id) ON DELETE CASCADE,
        completed_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (stage_id, society_id)
      );
    `);
    await client.query('ALTER TABLE redevelopment_stages ADD COLUMN IF NOT EXISTS society_id UUID;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS redevelopment_tenders (
        id                   UUID PRIMARY KEY,
        builder_name         VARCHAR(255) NOT NULL,
        extra_area_pct       NUMERIC(5,2) NOT NULL,
        corpus_amount_lakhs  NUMERIC(10,2) NOT NULL,
        status               VARCHAR(50) DEFAULT 'Under Review',
        society_id           UUID REFERENCES societies(id) ON DELETE CASCADE
      );
    `);
    await client.query('ALTER TABLE redevelopment_tenders ADD COLUMN IF NOT EXISTS society_id UUID;');
    // Remove the per-builder UNIQUE constraint that blocks multi-tenancy (safe if already dropped)
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'redevelopment_tenders_builder_name_key'
        ) THEN
          ALTER TABLE redevelopment_tenders DROP CONSTRAINT redevelopment_tenders_builder_name_key;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id          UUID PRIMARY KEY,
        title       VARCHAR(255) NOT NULL,
        description TEXT,
        member_name VARCHAR(100) NOT NULL,
        status      VARCHAR(50) DEFAULT 'Open',
        society_id  UUID REFERENCES societies(id) ON DELETE CASCADE,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query('ALTER TABLE complaints ADD COLUMN IF NOT EXISTS society_id UUID;');

    // ── STEP 6: Enable Row Level Security on all tables
    for (const tbl of ['society','users','user_profiles','societies','maintenance_bills',
                        'financial_records','agm_meetings','statutory_documents',
                        'redevelopment_stages','redevelopment_tenders','complaints']) {
      await client.query(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`);
    }

    await client.query('COMMIT');

    // ── STEP 7: Seed default society (outside transaction so we can read UUID back)
    let defaultSocietyId;
    const existingSoc = await pool.query('SELECT id FROM societies WHERE registration_no = $1', [seedData.society.registrationNo]);
    if (existingSoc.rows.length === 0) {
      const newSoc = await pool.query(
        'INSERT INTO societies (name, registration_no) VALUES ($1, $2) RETURNING id',
        [seedData.society.name, seedData.society.registrationNo]
      );
      defaultSocietyId = newSoc.rows[0].id;
    } else {
      defaultSocietyId = existingSoc.rows[0].id;
    }

    // ── STEP 8: Seed society metadata row
    const socMeta = await pool.query('SELECT id FROM society WHERE society_id = $1', [defaultSocietyId]);
    if (socMeta.rows.length === 0) {
      await pool.query(
        `INSERT INTO society (wing, total_flats, registered_name, registration_no, address, mtd_collection, outstanding_dues, active_complaints, society_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [seedData.society.wing, seedData.society.totalFlats,
         seedData.society.name, seedData.society.registrationNo,
         'Plot 42, Sector 15, Vashi, Navi Mumbai, Maharashtra 400703',
         345000, 42500, 2, defaultSocietyId]
      );
    } else {
      // Backfill society_id on old single-society rows that predate multi-tenancy
      await pool.query(
        `UPDATE society SET society_id = $1 WHERE society_id IS NULL`,
        [defaultSocietyId]
      );
    }

    // ── STEP 9: Seed users + user_profiles
    for (const u of seedData.users) {
      const exists = await pool.query('SELECT email FROM users WHERE email = $1', [u.email]);
      if (exists.rows.length === 0) {
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = crypto.scryptSync(u.password, salt, 64).toString('hex');
        await pool.query(
          'INSERT INTO users (email, salt, password_hash, is_master_admin) VALUES ($1, $2, $3, $4)',
          [u.email, salt, passwordHash, u.is_master_admin || false]
        );
      }
      // Ensure user_profile exists for this user in the default society
      const profExists = await pool.query(
        'SELECT email FROM user_profiles WHERE email = $1 AND society_id = $2',
        [u.email, defaultSocietyId]
      );
      if (profExists.rows.length === 0) {
        await pool.query(
          'INSERT INTO user_profiles (email, society_id, name, role) VALUES ($1, $2, $3, $4)',
          [u.email, defaultSocietyId, u.name, u.role]
        );
      }
    }

    // ── STEP 10: Clear legacy rows backfill (removed mock seeds so workspace starts empty)
    
    console.log(`[DB] Schema ready. Default society: ${defaultSocietyId}`);
    console.log('[DB] Seed users: admin@society.com / committee@society.com / accountant@society.com / resident@society.com');
  } catch (error) {
    console.error('Database initialization/seeding failed:', error.message);
    // Don't rethrow — let the server start even if seeding has minor issues
  } finally {
    client.release();
  }
}

async function getFullStateFromDb(societyId) {
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

  let activeSocietyId = societyId;
  if (!activeSocietyId) {
    const defaultSoc = await pool.query('SELECT id FROM societies LIMIT 1');
    activeSocietyId = defaultSoc.rows[0]?.id;
  }
  if (!activeSocietyId) return state;

  const resSoc = await pool.query('SELECT wing, total_flats as "totalFlats", registered_name as "registeredName", registration_no as "registrationNo", address, mtd_collection as "mtdCollection", outstanding_dues as "outstandingDues", active_complaints as "activeComplaints", rate_service as "rateService", rate_sinking as "rateSinking", rate_repair as "rateRepair", rate_water as "rateWater", rate_parking as "rateParking" FROM society WHERE society_id = $1 LIMIT 1', [activeSocietyId]);
  if (resSoc.rows[0]) {
    state.society = {
      ...resSoc.rows[0],
      rateService: Number(resSoc.rows[0].rateService || 1200),
      rateSinking: Number(resSoc.rows[0].rateSinking || 300),
      rateRepair: Number(resSoc.rows[0].rateRepair || 500),
      rateWater: Number(resSoc.rows[0].rateWater || 250),
      rateParking: Number(resSoc.rows[0].rateParking || 150)
    };
  }

  const resBills = await pool.query(`
    SELECT 
      id, flat_no as "flatNo", member_name as "memberName", amount, status,
      billing_month as "billingMonth", to_char(bill_date, 'YYYY-MM-DD') as "billDate",
      to_char(due_date, 'YYYY-MM-DD') as "dueDate", to_char(paid_date, 'YYYY-MM-DD') as "paidDate",
      service_charges as "serviceCharges", sinking_fund as "sinkingFund",
      repair_fund as "repairFund", water_charges as "waterCharges",
      parking_charges as "parkingCharges"
    FROM maintenance_bills 
    WHERE society_id = $1 
    ORDER BY bill_date DESC, flat_no ASC
  `, [activeSocietyId]);
  state.maintenanceBills = resBills.rows.map(r => ({
    ...r,
    amount: Number(r.amount || 0),
    serviceCharges: Number(r.serviceCharges || 0),
    sinkingFund: Number(r.sinkingFund || 0),
    repairFund: Number(r.repairFund || 0),
    waterCharges: Number(r.waterCharges || 0),
    parkingCharges: Number(r.parkingCharges || 0)
  }));

  const resRecords = await pool.query('SELECT id, to_char(date, \'YYYY-MM-DD\') as date, month, account_head as "accountHead", description, voucher_no as "voucherNo", type, amount FROM financial_records WHERE society_id = $1 ORDER BY date DESC, created_at DESC', [activeSocietyId]);
  state.financialRecords = resRecords.rows.map(r => ({ ...r, amount: Number(r.amount) }));

  const resAgm = await pool.query('SELECT id, to_char(date, \'YYYY-MM-DD\') as date, title, status, agenda FROM agm_meetings WHERE society_id = $1 ORDER BY date ASC', [activeSocietyId]);
  state.agmMeetings = resAgm.rows;

  const resDocs = await pool.query('SELECT id, title, category, form_id as "formId", form_name as "formName", original_name as "originalName", mime_type as "mimeType", file_size as "size", to_char(uploaded_at, \'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"\') as "uploadedAt" FROM statutory_documents WHERE society_id = $1 ORDER BY uploaded_at DESC', [activeSocietyId]);
  state.documents = resDocs.rows.map(r => ({
    ...r,
    url: `/uploads/${r.id}`
  }));

  const resStages = await pool.query('SELECT stage_id as "id", stage_name as "name", sub_text as "subText", status, to_char(completed_at, \'YYYY-MM-DD\') as "completedAt" FROM redevelopment_stages WHERE society_id = $1 ORDER BY stage_id ASC', [activeSocietyId]);
  state.redevelopmentStages = resStages.rows;

  const resTenders = await pool.query('SELECT id, builder_name as "builderName", extra_area_pct as "extraAreaPct", corpus_amount_lakhs as "corpusAmountLakhs", status FROM redevelopment_tenders WHERE society_id = $1 ORDER BY extra_area_pct DESC', [activeSocietyId]);
  state.redevelopmentTenders = resTenders.rows.map(r => ({
    ...r,
    extraAreaPct: Number(r.extraAreaPct),
    corpusAmountLakhs: Number(r.corpusAmountLakhs)
  }));

  const resComplaints = await pool.query('SELECT id, title, description, member_name as "memberName", status FROM complaints WHERE society_id = $1', [activeSocietyId]);
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
    'referrer-policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
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
  const mtdCollection = (data.society && data.society.mtdCollection !== undefined && data.society.mtdCollection !== null) ? Number(data.society.mtdCollection) : 0;
  const outstandingDues = (data.society && data.society.outstandingDues !== undefined && data.society.outstandingDues !== null) ? Number(data.society.outstandingDues) : 0;
  const activeComplaints = (data.society && data.society.activeComplaints !== undefined && data.society.activeComplaints !== null) ? Number(data.society.activeComplaints) : 0;
  
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
    activeComplaints,
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

async function handleUpload(req, res, societyId) {
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
      `INSERT INTO statutory_documents (id, title, category, form_id, form_name, original_name, mime_type, file_size, file_data, society_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        parts.title || originalName,
        parts.category || 'General',
        parts.formId || '',
        parts.formName || '',
        originalName,
        file.type,
        file.content.length,
        file.content,
        societyId
      ]
    );

    const db = await getFullStateFromDb(societyId);
    const document = db.documents.find(doc => doc.id === id);
    sendJson(res, 201, { document, dashboard: deriveDashboard(db) });
  } catch (error) {
    sendJson(res, 500, { error: `Upload processing failed: ${error.message}` });
  }
}

async function handleDeleteDocument(req, res, documentId, societyId) {
  try {
    const result = await pool.query('DELETE FROM statutory_documents WHERE id::text = $1 AND society_id = $2 RETURNING id, title', [documentId, societyId]);
    if (result.rows.length === 0) {
      return sendJson(res, 404, { error: 'Document not found.' });
    }

    const db = await getFullStateFromDb(societyId);
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
    if (req.method === 'POST' && url.pathname === '/api/login/google') {
      const { token } = await readJsonBody(req);
      if (!token) return sendJson(res, 400, { error: 'Google Token is required.' });
      
      let email;
      try {
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: CLIENT_ID, 
        });
        const payload = ticket.getPayload();
        email = payload.email;
      } catch (e) {
        return sendJson(res, 401, { error: 'Invalid Google token.' });
      }

      const result = await pool.query('SELECT is_master_admin FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      let user = result.rows[0];
      
      // If user doesn't exist but is the master admin email, create them on the fly for ease of use
      if (!user && email.toLowerCase() === 'ajay@gmail.com') {
         await pool.query("INSERT INTO users (email, salt, password_hash, is_master_admin) VALUES ($1, $2, $3, true)", 
         [email, crypto.randomBytes(16).toString('hex'), crypto.randomBytes(64).toString('hex')]);
         user = { is_master_admin: true };
      }

      if (!user) {
        return sendJson(res, 401, { error: 'User not registered. Please register your society first.' });
      }

      let role = 'resident';
      let society_id = null;

      if (user.is_master_admin) {
        role = 'master_admin';
      } else {
        const profRes = await pool.query('SELECT role, society_id FROM user_profiles WHERE LOWER(email) = LOWER($1)', [email]);
        const profile = profRes.rows[0];
        if (!profile) return sendJson(res, 401, { error: 'User profile not found.' });
        role = profile.role;
        society_id = profile.society_id;
      }

      const sessionToken = crypto.randomUUID();
      invalidateOldSessions(email); // Auto-kick old sessions (Option B)
      SESSIONS.set(sessionToken, { email, role, society_id, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });

      res.writeHead(200, {
        'Set-Cookie': `session_token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400`,
        'content-type': 'application/json; charset=utf-8'
      });
      return res.end(JSON.stringify({ success: true, user: { email, role } }));
    }

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

      const result = await pool.query('SELECT salt, password_hash, is_master_admin FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      const user = result.rows[0];
      if (!user) {
        return sendJson(res, 401, { error: 'Invalid email or password.' });
      }

      const hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
      if (hash !== user.password_hash) {
        return sendJson(res, 401, { error: 'Invalid email or password.' });
      }

      let role = 'resident';
      let society_id = null;

      if (user.is_master_admin) {
        role = 'master_admin';
      } else {
        // Query user profile
        const profRes = await pool.query('SELECT role, society_id FROM user_profiles WHERE LOWER(email) = LOWER($1)', [email]);
        const profile = profRes.rows[0];
        if (!profile) {
          return sendJson(res, 401, { error: 'User profile not found. Please contact administration.' });
        }
        role = profile.role;
        society_id = profile.society_id;
      }

      const token = crypto.randomUUID();
      invalidateOldSessions(email); // Auto-kick old sessions (Option B)
      SESSIONS.set(token, { email, role, society_id, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });

      res.writeHead(200, {
        'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400`,
        'content-type': 'application/json; charset=utf-8'
      });
      return res.end(JSON.stringify({ success: true, user: { email, role } }));
    }

    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const cookies = req.headers.cookie || '';
      const cookieMap = Object.fromEntries(cookies.split(';').map(c => {
        const parts = c.trim().split('=');
        return [parts[0], parts[1]];
      }));
      const token = cookieMap['session_token'];
      if (token) {
        SESSIONS.delete(token);
      }
      res.writeHead(200, {
        'Set-Cookie': 'session_token=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'content-type': 'application/json; charset=utf-8'
      });
      return res.end(JSON.stringify({ success: true }));
    }


function validateSocietyRegistrationNo(regNo) {
  if (!regNo) return { valid: false, error: 'Registration number is required.' };
  
  const parts = regNo.split('/');
  if (parts.length < 5 || parts.length > 6) {
    return { valid: false, error: 'Invalid registration number layout. Official Maharashtra format: DISTRICT/WARD/HSG/[TC|TA|GN]/NUMBER/YEAR (e.g. MUM/WP/HSG/TC/12345/2026)' };
  }

  const [district, ward, classification, subtype, numberStr, yearStr] = parts.length === 6 
    ? parts 
    : [parts[0], parts[1], parts[2], 'GN', parts[3], parts[4]];

  // 1. Validate District Code
  const validDistricts = new Set(['MUM', 'PNE', 'TNA', 'NGP', 'KGD', 'NAS', 'AMD', 'SAT', 'SOL', 'KOP', 'LAT', 'AUR', 'NND', 'JAL', 'DHU', 'NSA', 'KBD', 'YAT', 'CHA', 'BND', 'GND', 'GAD', 'AMR', 'BUL', 'WAS', 'AKO', 'PAR', 'BEED', 'OSM', 'JLG', 'RAT', 'SNG', 'SIN']);
  if (!validDistricts.has(district.toUpperCase())) {
    return { valid: false, error: `Invalid District code "${district}". Must be a valid Maharashtra district (e.g. MUM, PNE, TNA).` };
  }

  // 2. Validate Classification
  if (classification.toUpperCase() !== 'HSG') {
    return { valid: false, error: `Invalid Classification "${classification}". Housing societies must have classification code "HSG".` };
  }

  // 3. Validate Sub-classification
  const validSubtypes = new Set(['TC', 'TA', 'GN', 'OD', 'MHS']);
  if (!validSubtypes.has(subtype.toUpperCase())) {
    return { valid: false, error: `Invalid Sub-classification "${subtype}". Must be one of: TC (Tenant Co-partnership), TA (Tenant Association), GN (General), OD (Other).` };
  }

  // 4. Validate Serial Number
  if (!/^\d+$/.test(numberStr)) {
    return { valid: false, error: `Invalid Serial Number "${numberStr}". Must be numeric.` };
  }

  // 5. Validate Year
  if (!/^\d{4}$/.test(yearStr)) {
    return { valid: false, error: `Invalid Registration Year "${yearStr}". Must be a 4-digit year.` };
  }
  const year = parseInt(yearStr);
  const currentYear = new Date().getFullYear();
  if (year < 1960 || year > currentYear) {
    return { valid: false, error: `Invalid Year ${year}. Must be between 1960 and ${currentYear}.` };
  }

  return { valid: true };
}

    // --- LOGOUT ENDPOINT ---
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const sessionToken = req.headers.cookie?.split(';').find(c => c.trim().startsWith('session_token='))?.split('=')[1];
      if (sessionToken) {
        SESSIONS.delete(sessionToken);
      }
      res.writeHead(200, {
        'Set-Cookie': 'session_token=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
        'content-type': 'application/json'
      });
      return res.end(JSON.stringify({ success: true }));
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/onboard') {
      const { email, name, societyName, registrationNo, googleToken } = await readJsonBody(req);
      if (!email || !name || !societyName || !registrationNo) {
        return sendJson(res, 400, { error: 'All fields are required.' });
      }

      // Validate Registration Number
      const valResult = validateSocietyRegistrationNo(registrationNo);
      if (!valResult.valid) {
        return sendJson(res, 400, { error: valResult.error });
      }

      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      // Check if email already exists
      const emailExists = await pool.query('SELECT email FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (emailExists.rows.length > 0) {
        return sendJson(res, 400, { error: 'Email address already registered.' });
      }

      // Check if society registration no exists
      const regExists = await pool.query('SELECT id FROM societies WHERE LOWER(registration_no) = LOWER($1)', [registrationNo]);
      if (regExists.rows.length > 0) {
        return sendJson(res, 400, { error: 'Society registration number already registered.' });
      }

      // Generate a strong random password (8 chars)
      const generatedPassword = crypto.randomBytes(4).toString('hex');
      
      // 1. Create Society
      const socResult = await pool.query(
        'INSERT INTO societies (name, registration_no) VALUES ($1, $2) RETURNING id',
        [societyName, registrationNo]
      );
      const societyId = socResult.rows[0].id;

      // 2. Create user credentials
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(generatedPassword, salt, 64).toString('hex');
      await pool.query(
        'INSERT INTO users (email, salt, password_hash) VALUES ($1, $2, $3)',
        [email, salt, hash]
      );

      // 3. Create profile as super_admin
      await pool.query(
        'INSERT INTO user_profiles (email, society_id, name, role) VALUES ($1, $2, $3, $4)',
        [email, societyId, name, 'super_admin']
      );

      // 4. Create default entries
      await pool.query(
        "INSERT INTO society (wing, total_flats, registered_name, registration_no, address, society_id) VALUES ('A', 50, $1, $2, 'Update address in MDC.', $3)",
        [societyName, registrationNo, societyId]
      );

      // Send Email via Nodemailer (Gmail)
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS
          }
        });

        const mailOptions = {
          from: `"ResiEase Registration" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: 'Welcome to ResiEase - Your Admin Credentials',
          text: `Hello ${name},\n\nYour society "${societyName}" has been successfully registered on ResiEase.\n\nHere are your super admin login credentials:\nEmail: ${email}\nPassword: ${generatedPassword}\n\nPlease sign in at https://society-management-app-xh6q.onrender.com/login and change your password in the settings as soon as possible.\n\nRegards,\nThe ResiEase Team`
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully to ${email}`);
      } catch (err) {
        console.error('Failed to send email:', err);
        // Note: Even if email fails, account is created. In production, we'd queue this or handle better.
      }

      return sendJson(res, 200, { success: true });
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
      return sendJson(res, 200, { success: true, message: 'OTP passcode generated successfully.', otp });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
      const { email, code } = await readJsonBody(req);
      if (!email || !code) {
        return sendJson(res, 400, { error: 'Email and verification code are required.' });
      }
      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      const result = await pool.query('SELECT otp_code, otp_expires_at FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      const user = result.rows[0];
      if (!user || user.otp_code !== code || new Date(user.otp_expires_at) < new Date()) {
        return sendJson(res, 401, { error: 'Invalid or expired passcode. Please request a new one.' });
      }

      // Clear OTP on success
      await pool.query('UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE LOWER(email) = LOWER($1)', [email]);

      // Query or create profile
      const profRes = await pool.query('SELECT role, society_id FROM user_profiles WHERE LOWER(email) = LOWER($1)', [email]);
      let profile = profRes.rows[0];
      if (!profile) {
        // Fallback: associate them with the first society and set role to resident
        const socRes = await pool.query('SELECT id FROM societies LIMIT 1');
        const defaultSocietyId = socRes.rows[0]?.id;
        if (!defaultSocietyId) {
          return sendJson(res, 500, { error: 'No society exists to assign user to.' });
        }
        await pool.query(
          "INSERT INTO user_profiles (email, society_id, name, role) VALUES ($1, $2, $3, 'resident')",
          [email, defaultSocietyId, email.split('@')[0]]
        );
        profile = { role: 'resident', society_id: defaultSocietyId };
      }

      const token = crypto.randomUUID();
      SESSIONS.set(token, { email, role: profile.role, society_id: profile.society_id, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });

      res.writeHead(200, {
        'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400`,
        'content-type': 'application/json; charset=utf-8'
      });
      return res.end(JSON.stringify({ success: true, user: { email, role: profile.role } }));
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

    // Granular Role-Based Access Control (RBAC)
    const method = req.method;
    const pathname = url.pathname;

    // A. Residents are read-only: Block POST, DELETE, PUT operations
    if (session.role === 'resident') {
      if (['POST', 'DELETE', 'PUT'].includes(method)) {
        return sendJson(res, 403, { error: 'Access Denied: Read-only access for Residents.' });
      }
    }

    // B. Accountants are blocked from AGM meetings and MDC registry entirely
    if (session.role === 'accountant') {
      if (pathname.startsWith('/api/mdc/') || pathname === '/api/agm-meetings') {
        return sendJson(res, 403, { error: 'Access Denied: Accountants do not have access to this module.' });
      }
    }

    // C. Non-authorized roles cannot perform mutations
    if (['POST', 'DELETE', 'PUT'].includes(method)) {
      if (!['super_admin', 'accountant', 'master_admin'].includes(session.role)) {
        return sendJson(res, 403, { error: 'Access Denied: Unauthorized operation.' });
      }
    }

    // --- MASTER ADMIN ENDPOINTS ---
    if (pathname.startsWith('/api/master/')) {
      if (session.role !== 'master_admin') {
        return sendJson(res, 403, { error: 'Access Denied: Master Admin access required.' });
      }

      if (method === 'GET' && pathname === '/api/master/societies') {
        const result = await pool.query(`
          SELECT s.id, s.name, s.registration_no, s.status, s.created_at, 
                 u.email as admin_email
          FROM societies s
          LEFT JOIN user_profiles u ON u.society_id = s.id AND u.role = 'super_admin'
          ORDER BY s.created_at DESC
        `);
        return sendJson(res, 200, { societies: result.rows });
      }

      if (method === 'POST' && pathname.endsWith('/validate')) {
        const societyId = pathname.split('/')[3]; // /api/master/societies/:id/validate
        await pool.query('UPDATE societies SET status = $1 WHERE id = $2', ['VALIDATED', societyId]);
        return sendJson(res, 200, { success: true, message: 'Society validated successfully.' });
      }
    }
    // --- END MASTER ADMIN ENDPOINTS ---

    if (req.method === 'GET' && url.pathname === '/api/state') {
      const db = await getFullStateFromDb(session.society_id);
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
        `INSERT INTO financial_records (id, date, month, account_head, description, voucher_no, type, amount, society_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, date, month, accountHead, description, voucherNo || '', type, Number(amount || 0), session.society_id]
      );

      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 201, { record: { id, ...payload, amount: Number(amount) }, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/agm-meetings') {
      const payload = await readJsonBody(req);
      const { title, date, status, agenda } = payload;
      const id = `meet-${Date.now()}`;
      await pool.query(
        `INSERT INTO agm_meetings (id, title, date, status, agenda, society_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, title, date, status, agenda || '', session.society_id]
      );

      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 201, { meeting: { id, ...payload }, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/mdc/society') {
      const payload = await readJsonBody(req);
      const { 
        registeredName, registrationNo, address, wing, totalFlats, 
        mtdCollection, outstandingDues, activeComplaints,
        rateService, rateSinking, rateRepair, rateWater, rateParking 
      } = payload;
      await pool.query(
        `UPDATE society SET 
          registered_name = $1,
          registration_no = $2,
          address = $3,
          wing = $4,
          total_flats = $5,
          mtd_collection = $6,
          outstanding_dues = $7,
          active_complaints = $8,
          rate_service = $9,
          rate_sinking = $10,
          rate_repair = $11,
          rate_water = $12,
          rate_parking = $13
         WHERE society_id = $14`,
        [
          registeredName, registrationNo, address, wing, Number(totalFlats || 0), 
          Number(mtdCollection || 0), Number(outstandingDues || 0), Number(activeComplaints || 0),
          Number(rateService || 1200), Number(rateSinking || 300), Number(rateRepair || 500),
          Number(rateWater || 250), Number(rateParking || 150),
          session.society_id
        ]
      );
      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 200, { success: true, society: db.society, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/mdc/stages') {
      const payload = await readJsonBody(req);
      if (!Array.isArray(payload)) {
        return sendJson(res, 400, { error: 'Payload must be an array of stages.' });
      }
      for (const stage of payload) {
        const { id, name, subText, status } = stage;
        await pool.query(
          `UPDATE redevelopment_stages SET 
            stage_name = $1,
            sub_text = $2,
            status = $3
           WHERE stage_id = $4 AND society_id = $5`,
          [name, subText, status, Number(id), session.society_id]
        );
      }
      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 200, { success: true, redevelopmentStages: db.redevelopmentStages, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/mdc/tenders') {
      const payload = await readJsonBody(req);
      if (!Array.isArray(payload)) {
        return sendJson(res, 400, { error: 'Payload must be an array of tenders.' });
      }
      await pool.query('DELETE FROM redevelopment_tenders WHERE society_id = $1', [session.society_id]);
      for (const tender of payload) {
        const { builderName, extraAreaPct, corpusAmountLakhs, status } = tender;
        await pool.query(
          `INSERT INTO redevelopment_tenders (id, builder_name, extra_area_pct, corpus_amount_lakhs, status, society_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [crypto.randomUUID(), builderName, Number(extraAreaPct || 0), Number(corpusAmountLakhs || 0), status || 'Under Review', session.society_id]
        );
      }
      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 200, { success: true, redevelopmentTenders: db.redevelopmentTenders, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/mdc/import') {
      const payload = await readJsonBody(req);
      if (!Array.isArray(payload)) {
        return sendJson(res, 400, { error: 'Payload must be an array of bills.' });
      }
      await pool.query('DELETE FROM maintenance_bills WHERE society_id = $1', [session.society_id]);
      for (const bill of payload) {
        const { flatNo, memberName, amount, status } = bill;
        await pool.query(
          `INSERT INTO maintenance_bills (flat_no, member_name, amount, status, society_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [flatNo, memberName, Number(amount || 0), status || 'Unpaid', session.society_id]
        );
      }
      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 200, { success: true, maintenanceBills: db.maintenanceBills, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/documents') {
      return handleUpload(req, res, session.society_id);
    }

    if (req.method === 'POST' && url.pathname === '/api/maintenance/generate') {
      const payload = await readJsonBody(req);
      const { month } = payload;
      if (!month) {
        return sendJson(res, 400, { error: 'Billing month is required.' });
      }

      // Layman-friendly future month check (allows up to 7 days in advance)
      const parts = month.split(' ');
      const monthName = parts[0];
      const year = Number(parts[1]);
      const monthMap = {
        'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
        'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
      };
      
      if (monthMap[monthName] !== undefined && year) {
        const activationDate = new Date(year, monthMap[monthName], 1);
        const advanceLimit = new Date(activationDate);
        advanceLimit.setDate(advanceLimit.getDate() - 7);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (today < advanceLimit) {
          const earliestDateStr = advanceLimit.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
          return sendJson(res, 400, { error: `Billing for ${month} can only be activated starting ${earliestDateStr} (up to 7 days in advance).` });
        }
      }

      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      // Verify if bills already exist for this month
      const existCheck = await pool.query(
        'SELECT id FROM maintenance_bills WHERE society_id = $1 AND billing_month = $2 LIMIT 1',
        [session.society_id, month]
      );
      if (existCheck.rows.length > 0) {
        return sendJson(res, 400, { error: `Maintenance bills for ${month} have already been generated.` });
      }

      // Fetch society defaults
      const socRes = await pool.query(
        'SELECT wing, total_flats, rate_service, rate_sinking, rate_repair, rate_water, rate_parking FROM society WHERE society_id = $1 LIMIT 1',
        [session.society_id]
      );
      const soc = socRes.rows[0] || { wing: 'A', total_flats: 50 };
      const wing = soc.wing || 'A';
      const totalFlats = Number(soc.total_flats || 50);
      const service = Number(soc.rate_service || 1200);
      const sinking = Number(soc.rate_sinking || 300);
      const repair = Number(soc.rate_repair || 500);
      const water = Number(soc.rate_water || 250);
      const parking = Number(soc.rate_parking || 150);
      const amount = service + sinking + repair + water + parking;

      const billDate = new Date().toISOString().slice(0, 10);
      const dueDateObj = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const dueDate = dueDateObj.toISOString().slice(0, 10);

      // Generate bills for each flat
      for (let i = 1; i <= totalFlats; i++) {
        const floor = Math.floor((i - 1) / 10) + 1;
        const seq = ((i - 1) % 10) + 1;
        const flatNo = `${wing}-${floor}${seq < 10 ? '0' + seq : seq}`;
        const memberName = `Resident Flat ${flatNo}`;

        await pool.query(
          `INSERT INTO maintenance_bills (
            flat_no, member_name, amount, status, billing_month, bill_date, due_date,
            service_charges, sinking_fund, repair_fund, water_charges, parking_charges, society_id
          ) VALUES ($1, $2, $3, 'Draft', $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [flatNo, memberName, amount, month, billDate, dueDate, service, sinking, repair, water, parking, session.society_id]
        );
      }

      // Recalculate outstanding_dues
      await pool.query(
        `UPDATE society SET outstanding_dues = (
          SELECT COALESCE(SUM(amount), 0) FROM maintenance_bills 
          WHERE society_id = $1 AND status = 'Unpaid'
        ) WHERE society_id = $1`,
        [session.society_id]
      );

      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 201, { success: true, maintenanceBills: db.maintenanceBills, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/maintenance/approve') {
      const payload = await readJsonBody(req);
      const { month } = payload;
      if (!month) {
        return sendJson(res, 400, { error: 'Billing month is required.' });
      }
      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      // Find drafts and update to Unpaid
      const updateRes = await pool.query(
        "UPDATE maintenance_bills SET status = 'Unpaid' WHERE society_id = $1 AND billing_month = $2 AND status = 'Draft'",
        [session.society_id, month]
      );

      if (updateRes.rowCount === 0) {
        return sendJson(res, 404, { error: `No draft bills found for ${month} to approve.` });
      }

      // Recalculate outstanding_dues
      await pool.query(
        `UPDATE society SET outstanding_dues = (
          SELECT COALESCE(SUM(amount), 0) FROM maintenance_bills 
          WHERE society_id = $1 AND status = 'Unpaid'
        ) WHERE society_id = $1`,
        [session.society_id]
      );

      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 200, { success: true, message: `Approved ${updateRes.rowCount} bills for ${month}.`, maintenanceBills: db.maintenanceBills, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/maintenance/pay') {
      const payload = await readJsonBody(req);
      const { billId } = payload;
      if (!billId) {
        return sendJson(res, 400, { error: 'Bill ID is required.' });
      }

      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      // Look up target bill
      const billRes = await pool.query(
        'SELECT flat_no, amount, billing_month FROM maintenance_bills WHERE id = $1 AND society_id = $2 LIMIT 1',
        [billId, session.society_id]
      );
      const bill = billRes.rows[0];
      if (!bill) {
        return sendJson(res, 404, { error: 'Maintenance bill not found.' });
      }

      const today = new Date().toISOString().slice(0, 10);
      const todayMonth = new Date().toLocaleString('en-US', { month: 'short' });

      // 1. Mark bill as Paid
      await pool.query(
        'UPDATE maintenance_bills SET status = \'Paid\', paid_date = $1 WHERE id = $2 AND society_id = $3',
        [today, billId, session.society_id]
      );

      // 2. Add receipt to ledger
      const voucherNo = `RV-M${Date.now().toString().slice(-6)}`;
      await pool.query(
        `INSERT INTO financial_records (id, date, month, account_head, description, voucher_no, type, amount, society_id)
         VALUES ($1, $2, $3, 'Maintenance Collection', $4, $5, 'income', $6, $7)`,
        [
          crypto.randomUUID(), today, todayMonth,
          `Maintenance payment for Flat ${bill.flat_no} - ${bill.billing_month}`,
          voucherNo, Number(bill.amount), session.society_id
        ]
      );

      // 3. Update society outstanding_dues & mtd_collection
      await pool.query(
        `UPDATE society SET outstanding_dues = (
          SELECT COALESCE(SUM(amount), 0) FROM maintenance_bills 
          WHERE society_id = $1 AND status = 'Unpaid'
        ) WHERE society_id = $1`,
        [session.society_id]
      );

      await pool.query(
        `UPDATE society SET mtd_collection = (
          SELECT COALESCE(SUM(amount), 0) FROM financial_records 
          WHERE society_id = $1 AND type = 'income' AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
        ) WHERE society_id = $1`,
        [session.society_id]
      );

      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 200, { success: true, maintenanceBills: db.maintenanceBills, dashboard: deriveDashboard(db) });
    }

    const documentDeleteMatch = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
    if (req.method === 'DELETE' && documentDeleteMatch) {
      return handleDeleteDocument(req, res, decodeURIComponent(documentDeleteMatch[1]), session.society_id);
    }

    sendJson(res, 404, { error: 'API route not found.' });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function serveStatic(req, res, url) {
  let requested = decodeURIComponent(url.pathname);
  if (requested === '/') {
    requested = '/landing.html';
  } else if (requested === '/register' || requested === '/register.html') {
    requested = '/register.html';
  } else if (requested === '/login' || requested === '/login.html') {
    // If the user already has a valid session, redirect to /app
    const session = getSession(req);
    if (session && session.expiresAt > Date.now()) {
      res.writeHead(302, { 
        'Location': '/app',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      });
      return res.end();
    }
    requested = '/login.html';
  } else if (requested === '/app' || requested === '/index.html' || requested === '/master.html') {
    // Verify session before serving dashboard pages
    const session = getSession(req);
    if (!session || session.expiresAt < Date.now()) {
      res.writeHead(302, { 
        'Location': '/login',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      });
      return res.end();
    }
    
    // Always enforce proper role mapping regardless of how they access it
    requested = session.role === 'master_admin' ? '/master.html' : '/index.html';
  }
  
  const target = path.normalize(path.join(ROOT, requested));
  if (!target.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const data = await fs.readFile(target);
    let ext = path.extname(target).toLowerCase();
    if (requested === '/login' || requested === '/master.html' || requested === '/index.html') {
      ext = '.html';
    }
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 
      'content-type': type,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  console.log(`[HTTP REQUEST] ${req.method} ${req.url} - ${req.headers['user-agent'] || ''}`);
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
      const result = await pool.query('SELECT mime_type, file_data FROM statutory_documents WHERE id::text = $1 AND society_id = $2', [docId, session.society_id]);
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

