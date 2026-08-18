require('dotenv').config();
const { AsyncLocalStorage } = require('async_hooks');
const asyncLocalStorage = new AsyncLocalStorage();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
// CB5 FIXED: Removed global TLS bypass (NODE_TLS_REJECT_UNAUTHORIZED='0') — was disabling certificate validation for ALL outbound HTTPS calls.
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { z } = require('zod');

// --- Strict Zod Validation Schemas ---
const schemas = {
  login: z.object({
    email: z.string().email("Invalid email format").toLowerCase(),
    password: z.string().min(1, "Password is required")
  }),
  googleLogin: z.object({
    token: z.string().min(1, "Google token is required")
  }),
  onboard: z.object({
    email: z.string().email("Invalid email format").toLowerCase(),
    name: z.string().min(1, "Full name is required").max(100),
    societyName: z.string().min(1, "Society name is required").max(255),
    registrationNo: z.string().min(1, "Registration number is required").max(100),
    googleToken: z.string().optional()
  }),
  sendOtp: z.object({
    email: z.string().email("Invalid email format").toLowerCase()
  }),
  verifyOtp: z.object({
    email: z.string().email("Invalid email format").toLowerCase(),
    otp: z.string().optional(),
    code: z.string().optional()
  }).transform(data => ({
    email: data.email,
    otp: (data.otp || data.code || '').trim()
  })).refine(data => data.otp.length >= 4 && data.otp.length <= 10, {
    message: "A valid verification passcode is required"
  }),
  importResidents: z.array(z.object({
    name: z.string().min(1, "Resident name is required"),
    flat_no: z.string().min(1, "Flat number is required"),
    email: z.string().email("Invalid email format").optional().or(z.literal('')).or(z.null()),
    phone: z.string().optional().nullable()
  })),
  financialRecord: z.object({
    date: z.string().min(1, "Date is required"),
    month: z.string().min(1, "Month is required"),
    accountHead: z.string().min(1, "Account Head is required").max(255),
    description: z.string().optional().nullable(),
    voucherNo: z.string().optional().nullable(),
    type: z.enum(['income', 'expense'], { errorMap: () => ({ message: "Type must be 'income' or 'expense'" }) }),
    amount: z.union([z.number(), z.string()]).transform(v => Number(v)).refine(v => !isNaN(v) && v > 0, { message: "Amount must be a positive number" })
  }),
  agmMeeting: z.object({
    title: z.string().min(1, "Meeting title is required").max(255),
    date: z.string().min(1, "Meeting date is required"),
    status: z.string().min(1, "Status is required"),
    agenda: z.string().optional().nullable(),
    financialYear: z.string().optional().nullable()
  }),
  agmResolution: z.object({
    meetingId: z.string().min(1, "Meeting ID is required"),
    resolutionText: z.string().min(1, "Resolution text is required"),
    status: z.string().optional().default('Proposed')
  }),
  agmDocumentUpload: z.object({
    meetingId: z.string().min(1, "Meeting ID is required"),
    financialYear: z.string().optional().nullable(),
    documentType: z.string().min(1, "Document type is required"),
    fileName: z.string().min(1, "File name is required"),
    mimeType: z.string().min(1, "MIME type is required"),
    size: z.union([z.number(), z.string()]).transform(v => Number(v)),
    base64: z.string().min(1, "File data is required")
  }),
  mdcSociety: z.object({
    registeredName: z.string().min(1, "Registered name is required"),
    registrationNo: z.string().min(1, "Registration number is required"),
    wing: z.string().min(1, "Wing is required"),
    totalFlats: z.union([z.number(), z.string()]).transform(v => Number(v)).refine(v => !isNaN(v) && v > 0, "Total flats must be > 0"),
    address: z.string().optional().nullable(),
    mtdCollection: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(0),
    outstandingDues: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(0),
    activeComplaints: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(0),
    rateService: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(1200),
    rateSinking: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(300),
    rateRepair: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(500),
    rateWater: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(250),
    rateParking: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(150)
  }),
  mdcStages: z.array(z.object({
    id: z.number().int(),
    name: z.string().min(1),
    subText: z.string().optional().default(''),
    status: z.string().min(1)
  })),
  mdcTenders: z.array(z.object({
    builderName: z.string().min(1),
    extraAreaPct: z.union([z.number(), z.string()]).transform(v => Number(v)),
    corpusAmountLakhs: z.union([z.number(), z.string()]).transform(v => Number(v)),
    status: z.string().optional().default('Under Review')
  })),
  mdcImport: z.array(z.object({
    flatNo: z.string().min(1, "Flat number is required"),
    memberName: z.string().min(1, "Member name is required"),
    amount: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(0),
    status: z.string().optional().default('Unpaid')
  })),
  addMember: z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email format").toLowerCase(),
    role: z.enum(['resident', 'accountant', 'society_admin', 'master_admin', 'super_admin']),
    flatNo: z.string().optional().nullable(),
    phone: z.string().optional().nullable()
  }),
  deleteMember: z.object({
    email: z.string().email("Invalid email format").toLowerCase()
  }),
  maintenanceGenerate: z.object({
    invoiceDate: z.string().min(1, "Invoice date is required"),
    dueDate: z.string().min(1, "Due date is required"),
    billingMonth: z.string().min(1, "Billing month label is required"),
    targetFlat: z.string().optional().nullable(),
    customCharges: z.array(z.object({
      name: z.string().min(1),
      amount: z.union([z.number(), z.string()]).transform(v => Number(v))
    })).optional()
  }),
  maintenanceApprove: z.object({
    month: z.string().min(1, "Billing month is required")
  }),
  maintenanceSendOtp: z.object({
    billId: z.string().min(1, "Bill ID is required"),
    phone: z.string().optional().nullable()
  }),
  maintenanceSendAll: z.object({
    month: z.string().min(1, "Billing month is required")
  }),
  maintenancePay: z.object({
    billId: z.string().min(1, "Bill ID is required"),
    paymentMethod: z.string().optional()
  })
};

function validatePayload(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const errorMsg = result.error.errors.map(e => `${e.path.join('.') || 'payload'}: ${e.message}`).join(', ');
    return { valid: false, error: errorMsg, details: result.error.format() };
  }
  return { valid: true, data: result.data };
}

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
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
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
  // node-postgres re-parses `sslmode` out of the connection string and merges it
  // OVER the explicit `ssl` option below (see ConnectionParameters in pg/lib/
  // connection-parameters.js), so a `sslmode=require` in DATABASE_URL silently
  // replaced rejectUnauthorized:false with ssl:true, causing every connection to
  // fail with "self-signed certificate in certificate chain". Stripping sslmode
  // here lets our explicit ssl object take effect.
  const dbUrl = new URL(process.env.DATABASE_URL);
  dbUrl.searchParams.delete('sslmode');
  pool = new Pool({
    connectionString: dbUrl.toString(),
    ssl: {
      rejectUnauthorized: false
    }
  });

  // RLS Middleware Patch
  const originalPoolQuery = pool.query.bind(pool);
  pool.query = async function(text, params) {
    const store = asyncLocalStorage.getStore();
    if (store && store.society_id) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const safeId = client.escapeLiteral(String(store.society_id));
        await client.query(`SET LOCAL app.current_tenant = ${safeId}`);
        const res = await client.query(text, params);
        await client.query('COMMIT');
        return res;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    return originalPoolQuery(text, params);
  };
} else {
  console.warn("WARNING: DATABASE_URL not set in env. Database operations will fail.");
}

/**
 * Explicit Tenant Context Wrapper for executing database operations with Postgres RLS.
 * Guarantees SET LOCAL app.current_tenant inside a transaction and releases the connection safely.
 */
async function withTenant(societyId, callback) {
  if (!societyId) throw new Error("Tenant societyId is required for this operation.");
  if (!pool) throw new Error("Database pool is not initialized.");

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const safeId = client.escapeLiteral(String(societyId));
    await client.query(`SET LOCAL app.current_tenant = ${safeId}`);

    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// DB-Backed Session Helpers
async function invalidateOldSessions(email) {
  if (!pool) return;
  await pool.query('DELETE FROM sessions WHERE LOWER(email) = LOWER($1)', [email]);
}

async function createSession(token, email, role, society_id) {
  if (!pool) return;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await pool.query(
    'INSERT INTO sessions (token, email, role, society_id, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [token, email, role, society_id, expiresAt]
  );
}

async function deleteSession(token) {
  if (!pool) return;
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
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

async function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session_token;
  if (!token || !pool) return null;
  return getSessionFromToken(token);
}

async function getSessionFromToken(token) {
  if (!pool) return null;
  const res = await pool.query('SELECT * FROM sessions WHERE token = $1', [token]);
  if (res.rows.length === 0) return null;
  const session = res.rows[0];
  return {
    email: session.email,
    role: session.role,
    society_id: session.society_id,
    expiresAt: new Date(session.expires_at).getTime()
  };
}


// Audit Logger — fire-and-forget, never blocks a response
async function logAudit({ societyId, actorEmail, action, entity, entityId, oldValue, newValue, ipAddress }) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO audit_logs (society_id, actor_email, action, entity, entity_id, old_value, new_value, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [societyId || null, actorEmail, action, entity || null, entityId || null,
       oldValue ? JSON.stringify(oldValue) : null,
       newValue ? JSON.stringify(newValue) : null,
       ipAddress || null]
    );
  } catch (err) {
    console.error('[AUDIT] Failed to write audit log:', err.message);
  }
}

// Safe Non-Blocking Email Dispatcher (Short timeouts, never blocks API)
async function sendEmailSafely({ to, subject, text, fromName = 'ResiEase' }) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;

  if (!gmailUser || !gmailPass) {
    console.log(`[EMAIL-SIMULATION] No GMAIL_USER/PASS configured. Simulated email to ${to}:`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${text}`);
    return { sent: false, simulated: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 5000
    });

    const info = await transporter.sendMail({
      from: `"${fromName}" <${gmailUser}>`,
      to,
      subject,
      text
    });
    console.log(`[EMAIL-SENT] Successfully sent email to ${to}, id: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EMAIL-ERROR] Failed to send email to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
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
        phone       VARCHAR(20),
        PRIMARY KEY (email, society_id)
      );
    `);
    await client.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(20);');
    await client.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS flat_no VARCHAR(50);');

    // ── STEP 3.5: Persistent Sessions
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token       VARCHAR(255) PRIMARY KEY,
        email       VARCHAR(255) NOT NULL,
        role        VARCHAR(50) NOT NULL,
        society_id  UUID,
        expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);');



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
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS whatsapp_reminder_sent BOOLEAN DEFAULT false;');
    await client.query('ALTER TABLE maintenance_bills ADD COLUMN IF NOT EXISTS custom_charges JSONB DEFAULT \'[]\'::jsonb;');

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
    await client.query('ALTER TABLE agm_meetings ADD COLUMN IF NOT EXISTS financial_year VARCHAR(20);');

    await client.query(`
      CREATE TABLE IF NOT EXISTS agm_documents (
        id            UUID PRIMARY KEY,
        meeting_id    VARCHAR(100) REFERENCES agm_meetings(id) ON DELETE CASCADE,
        society_id    UUID REFERENCES societies(id) ON DELETE CASCADE,
        financial_year VARCHAR(20),
        document_type VARCHAR(100) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type     VARCHAR(100) NOT NULL,
        file_size     INT NOT NULL,
        file_data     BYTEA NOT NULL,
        uploaded_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agm_resolutions (
        id            UUID PRIMARY KEY,
        meeting_id    VARCHAR(100) REFERENCES agm_meetings(id) ON DELETE CASCADE,
        society_id    UUID REFERENCES societies(id) ON DELETE CASCADE,
        resolution_text TEXT NOT NULL,
        status        VARCHAR(50) DEFAULT 'Proposed',
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

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
        financial_year VARCHAR(10),
        period        VARCHAR(20),
        uploaded_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query('ALTER TABLE statutory_documents ADD COLUMN IF NOT EXISTS society_id UUID;');
    await client.query('ALTER TABLE statutory_documents ADD COLUMN IF NOT EXISTS financial_year VARCHAR(10);');
    await client.query('ALTER TABLE statutory_documents ADD COLUMN IF NOT EXISTS period VARCHAR(20);');

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

    // ── STEP 5.5: Audit Logs — immutable trail of every sensitive action (legal req for accounting SaaS)
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id  UUID REFERENCES societies(id) ON DELETE SET NULL,
        actor_email VARCHAR(255) NOT NULL,
        action      VARCHAR(100) NOT NULL,
        entity      VARCHAR(100),
        entity_id   TEXT,
        old_value   JSONB,
        new_value   JSONB,
        ip_address  VARCHAR(50),
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_society ON audit_logs(society_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_email);');

    // ── STEP 6: Row-Level Security (RLS) — real policies using app.current_tenant
    const tenantTables = [
      'society', 'maintenance_bills', 'financial_records',
      'agm_meetings', 'agm_documents', 'agm_resolutions',
      'statutory_documents', 'redevelopment_stages', 'redevelopment_tenders',
      'complaints'
    ];
    for (const tbl of tenantTables) {
      await client.query(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY`);
      await client.query(`ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY`);
      // Drop old policy if exists so this is idempotent
      await client.query(`DROP POLICY IF EXISTS tenant_isolation ON ${tbl}`);
      await client.query(`
        CREATE POLICY tenant_isolation ON ${tbl}
        USING (
          current_setting('app.current_tenant', true) = '__BYPASS__'
          OR (current_setting('app.current_tenant', true) IS NOT NULL AND society_id::text = current_setting('app.current_tenant', true))
        )
        WITH CHECK (
          current_setting('app.current_tenant', true) = '__BYPASS__'
          OR (current_setting('app.current_tenant', true) IS NOT NULL AND society_id::text = current_setting('app.current_tenant', true))
        )
      `);
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
        const passwordHash = crypto.scryptSync(u.password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
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
      parking_charges as "parkingCharges", custom_charges as "customCharges",
      whatsapp_reminder_sent as "whatsappReminderSent"
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
    parkingCharges: Number(r.parkingCharges || 0),
    customCharges: typeof r.customCharges === 'string' ? JSON.parse(r.customCharges) : (r.customCharges || [])
  }));

  const resRecords = await pool.query('SELECT id, to_char(date, \'YYYY-MM-DD\') as date, month, account_head as "accountHead", description, voucher_no as "voucherNo", type, amount FROM financial_records WHERE society_id = $1 ORDER BY date DESC, created_at DESC', [activeSocietyId]);
  state.financialRecords = resRecords.rows.map(r => ({ ...r, amount: Number(r.amount) }));

  const resAgm = await pool.query('SELECT id, to_char(date, \'YYYY-MM-DD\') as date, title, status, agenda, financial_year as "financialYear" FROM agm_meetings WHERE society_id = $1 ORDER BY date ASC', [activeSocietyId]);
  const resAgmDocs = await pool.query('SELECT id, meeting_id as "meetingId", financial_year as "financialYear", document_type as "documentType", original_name as "originalName", mime_type as "mimeType", file_size as "size", to_char(uploaded_at, \'YYYY-MM-DD"T"HH24:MI:SS"Z"\') as "uploadedAt" FROM agm_documents WHERE society_id = $1 ORDER BY uploaded_at DESC', [activeSocietyId]);
  const resAgmRes = await pool.query('SELECT id, meeting_id as "meetingId", resolution_text as "resolutionText", status, to_char(created_at, \'YYYY-MM-DD"T"HH24:MI:SS"Z"\') as "createdAt" FROM agm_resolutions WHERE society_id = $1 ORDER BY created_at ASC', [activeSocietyId]);
  
  state.agmMeetings = resAgm.rows.map(m => ({
    ...m,
    documents: resAgmDocs.rows.filter(d => d.meetingId === m.id).map(d => ({...d, url: `/uploads/agm/${d.id}`})),
    resolutions: resAgmRes.rows.filter(r => r.meetingId === m.id)
  }));

  const resDocs = await pool.query('SELECT id, title, category, form_id as "formId", form_name as "formName", original_name as "originalName", mime_type as "mimeType", file_size as "size", financial_year as "financialYear", period, to_char(uploaded_at, \'YYYY-MM-DD"T"HH24:MI:SS"Z"\') as "uploadedAt" FROM statutory_documents WHERE society_id = $1 ORDER BY uploaded_at DESC', [activeSocietyId]);
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

function readBody(req, maxBytes = 10 * 1024 * 1024) { // 10MB safety cap
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy(new Error('Payload too large'));
        return reject(new Error('Payload too large. Maximum allowed size is 10MB.'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req, maxBytes = 2 * 1024 * 1024) { // 2MB max for JSON API payloads
  const body = await readBody(req, maxBytes);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch (e) {
    throw new Error('Malformed JSON payload: ' + e.message);
  }
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
      `INSERT INTO statutory_documents (id, title, category, form_id, form_name, original_name, mime_type, file_size, file_data, society_id, financial_year, period)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
        societyId,
        parts.financialYear || '',
        parts.period || ''
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
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.googleLogin, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error });
      const { token } = val.data;
      
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
      await invalidateOldSessions(email); // Auto-kick old sessions (Option B)
      await createSession(sessionToken, email, role, society_id);

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
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.login, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error });
      const { email, password } = val.data;

      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      const result = await pool.query('SELECT salt, password_hash, is_master_admin FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      const user = result.rows[0];
      if (!user) {
        return sendJson(res, 401, { error: 'Invalid email or password.' });
      }

      const hash = crypto.scryptSync(password, user.salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
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
      await invalidateOldSessions(email); // Auto-kick old sessions (Option B)
      await createSession(token, email, role, society_id);

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
        await deleteSession(token);
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
        await deleteSession(sessionToken);
      }
      res.writeHead(200, {
        'Set-Cookie': 'session_token=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
        'content-type': 'application/json'
      });
      return res.end(JSON.stringify({ success: true }));
    }

    // --- WHATSAPP META WEBHOOK ---
    if (url.pathname === '/api/webhooks/whatsapp') {
      if (req.method === 'GET') {
        const query = url.searchParams;
        const mode = query.get('hub.mode');
        const token = query.get('hub.verify_token');
        const challenge = query.get('hub.challenge');

        if (mode && token) {
          if (mode === 'subscribe' && token === 'resiease_whatsapp_webhook') {
            console.log('[WHATSAPP] Webhook verified.');
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            return res.end(challenge);
          } else {
            res.writeHead(403);
            return res.end();
          }
        }
      }

      if (req.method === 'POST') {
        try {
          const body = await readJsonBody(req);
          
          if (body.object) {
            if (
              body.entry &&
              body.entry[0].changes &&
              body.entry[0].changes[0] &&
              body.entry[0].changes[0].value.messages &&
              body.entry[0].changes[0].value.messages[0]
            ) {
              const msg = body.entry[0].changes[0].value.messages[0];
              const phone_number_id = body.entry[0].changes[0].value.metadata.phone_number_id;
              const from = msg.from; // Sender's WhatsApp number
              const msg_body = msg.text ? msg.text.body.trim() : '';

              console.log(`[WHATSAPP] Received message from ${from}: ${msg_body}`);

              const userRes = await pool.query('SELECT * FROM user_profiles WHERE phone = $1', [from]);
              const META_TOKEN = process.env.META_ACCESS_TOKEN;
              
              if (userRes.rows.length === 0) {
                const flatMatch = msg_body.match(/^[A-Za-z0-9]+-[0-9]+$/);
                if (flatMatch) {
                  const flatNo = flatMatch[0].toUpperCase();
                  await pool.query('UPDATE user_profiles SET phone = $1 WHERE flat_no = $2 OR name ILIKE $3', [from, flatNo, `%${flatNo}%`]);
                  
                  await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      messaging_product: 'whatsapp',
                      to: from,
                      text: { body: `✅ Successfully linked your WhatsApp to Flat ${flatNo}. You will now receive automated maintenance reminders here.` }
                    })
                  });
                } else {
                  await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      messaging_product: 'whatsapp',
                      to: from,
                      text: { body: 'Welcome to ResiEase! 🏢 Please reply with your Flat Number (e.g., A-101) to link your account and receive maintenance reminders.' }
                    })
                  });
                }
              }
            }
            res.writeHead(200);
            return res.end('EVENT_RECEIVED');
          } else {
            res.writeHead(404);
            return res.end();
          }
        } catch (e) {
          console.error('[WHATSAPP] Webhook error:', e);
          res.writeHead(500);
          return res.end();
        }
      }
    }

    // --- BULK IMPORT RESIDENTS ---
    if (req.method === 'POST' && url.pathname === '/api/societies/import-residents') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.importResidents, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error });
      const payload = val.data;
      
      const sessionToken = req.headers.cookie?.split(';').find(c => c.trim().startsWith('session_token='))?.split('=')[1];
      const session = await getSessionFromToken(sessionToken);
      if (!session || session.role !== 'super_admin') {
        return sendJson(res, 403, { error: 'Unauthorized.' });
      }

      let importedCount = 0;
      for (const resData of payload) {
        if (!resData.name || !resData.flat_no) continue;
        
        const exists = await pool.query('SELECT * FROM user_profiles WHERE society_id = $1 AND (email = $2 OR name = $3)', [session.society_id, resData.email, resData.name]);
        
        if (exists.rows.length === 0) {
          const resEmail = resData.email || `${resData.flat_no.toLowerCase()}@resiease.local`;
          
          await pool.query(
            "INSERT INTO user_profiles (society_id, name, email, phone, role, flat_no) VALUES ($1, $2, $3, $4, 'resident', $5)",
            [session.society_id, resData.name, resEmail, resData.phone || null, resData.flat_no || null]
          );
          
          // Create login credentials so they can log in via OTP
          const emailExists = await pool.query('SELECT email FROM users WHERE LOWER(email) = LOWER($1)', [resEmail]);
          if (emailExists.rows.length === 0) {
            const dummyPassword = crypto.randomBytes(8).toString('hex');
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = crypto.scryptSync(dummyPassword, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
            await pool.query(
              'INSERT INTO users (email, salt, password_hash) VALUES ($1, $2, $3)',
              [resEmail, salt, hash]
            );
          }
          importedCount++;
        }
      }
      return sendJson(res, 200, { success: true, count: importedCount });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/onboard') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.onboard, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error });
      const { email, name, societyName, registrationNo, googleToken } = val.data;

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

      // H5 FIXED: Increased entropy from 4 bytes (32-bit) to 16 bytes (128-bit) for onboarding password
      const generatedPassword = crypto.randomBytes(16).toString('hex');
      
      // 1. Create Society
      const socResult = await pool.query(
        'INSERT INTO societies (name, registration_no) VALUES ($1, $2) RETURNING id',
        [societyName, registrationNo]
      );
      const societyId = socResult.rows[0].id;

      // 2. Create user credentials
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(generatedPassword, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
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

      // Dispatch Onboarding Credentials Email (non-blocking)
      sendEmailSafely({
        to: email,
        subject: 'Welcome to ResiEase - Your Admin Credentials',
        fromName: 'ResiEase Registration',
        text: `Hello ${name},\n\nYour society "${societyName}" has been successfully registered on ResiEase.\n\nHere are your super admin login credentials:\nEmail: ${email}\nPassword: ${generatedPassword}\n\nPlease sign in at https://society-management-app-xh6q.onrender.com/login and change your password in the settings as soon as possible.\n\nRegards,\nThe ResiEase Team`
      }).catch(err => console.error('[ONBOARD-EMAIL-FAIL]', err));

      return sendJson(res, 200, { success: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/send-otp') {
      // H3 FIXED: Rate-limit OTP sending endpoint
      const clientIp = req.socket.remoteAddress || '127.0.0.1';
      if (isLoginRateLimited(clientIp)) {
        return sendJson(res, 429, { error: 'Too many requests. Please try again after 15 minutes.' });
      }

      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.sendOtp, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error });
      const { email } = val.data;
      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      // CB1 FIXED: OTP is generated and stored, but NEVER returned in the HTTP response body.
      // In production, connect nodemailer here to email the OTP to the user.
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry
      
      const exists = await pool.query('SELECT email FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (exists.rows.length === 0) {
        // SECURITY FIX: Do NOT auto-register unknown emails.
        // Only pre-registered users (added by a super_admin) can use OTP login.
        // Return a generic 404 — do not confirm whether the email exists or not.
        return sendJson(res, 404, { error: 'This email is not registered with any society. Please contact your society admin.' });
      } else {
        await pool.query(
          'UPDATE users SET otp_code = $1, otp_expires_at = $2, auth_method = \'otp\' WHERE LOWER(email) = LOWER($3)',
          [otp, expiresAt, email]
        );
      }

      // Send OTP via email safely
      const mailResult = await sendEmailSafely({
        to: email,
        subject: 'Your ResiEase Login Passcode',
        fromName: 'ResiEase Security',
        text: `Your one-time login passcode is: ${otp}\n\nThis code expires in 5 minutes. Do not share it with anyone.`
      });
      console.log(`[AUTH-OTP] Passcode generated for ${email}: ${otp} (Email dispatched: ${mailResult.sent})`);

      return sendJson(res, 200, { success: true, message: 'A login passcode has been sent to your email address.' });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
      // H3 FIXED: Rate-limit OTP verification to prevent brute-force
      const otpClientIp = req.socket.remoteAddress || '127.0.0.1';
      if (isLoginRateLimited(otpClientIp)) {
        return sendJson(res, 429, { error: 'Too many attempts. Please try again after 15 minutes.' });
      }
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.verifyOtp, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error });
      const { email, otp } = val.data;
      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      const result = await pool.query('SELECT otp_code, otp_expires_at FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      const user = result.rows[0];
      if (!user || user.otp_code !== otp || new Date(user.otp_expires_at) < new Date()) {
        return sendJson(res, 401, { error: 'Invalid or expired passcode. Please request a new one.' });
      }

      // Clear OTP on success
      await pool.query('UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE LOWER(email) = LOWER($1)', [email]);

      // Query or create profile
      const profRes = await pool.query('SELECT role, society_id FROM user_profiles WHERE LOWER(email) = LOWER($1)', [email]);
      let profile = profRes.rows[0];
      if (!profile) {
        // SECURITY FIX: Do NOT auto-assign unknown users to a society.
        // If no profile exists, the user was not registered by an admin.
        await pool.query('UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE LOWER(email) = LOWER($1)', [email]);
        return sendJson(res, 403, { error: 'Your email is not associated with any society. Please contact your society admin.' });
      }

      const token = crypto.randomUUID();
      await createSession(token, email, profile.role, profile.society_id);

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
        await deleteSession(token);
      }
      res.writeHead(200, {
        'Set-Cookie': `session_token=; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
        'content-type': 'application/json; charset=utf-8'
      });
      return res.end(JSON.stringify({ success: true }));
    }

    // 2. Protect all other API endpoints
    const session = await getSession(req);
    if (!session || session.expiresAt < Date.now()) {
      if (session) {
        const cookies = parseCookies(req.headers.cookie);
        await deleteSession(cookies.session_token);
      }
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    
    asyncLocalStorage.enterWith({ society_id: session.society_id });

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
    // H2 FIXED: Added 'society_admin' to align with front-end RBAC which also grants admin privileges to this role
    if (['POST', 'DELETE', 'PUT'].includes(method)) {
      if (!['super_admin', 'society_admin', 'accountant', 'master_admin'].includes(session.role)) {
        return sendJson(res, 403, { error: 'Access Denied: Unauthorized operation.' });
      }
    }

    // --- MASTER ADMIN ENDPOINTS ---
    // CB4 FIXED: /api/debug/agm was a cross-tenant data leak (no society_id filter, no role check).
    // Moved inside the master_admin-only block below. Remove in production when no longer needed.

    if (pathname.startsWith('/api/master/') || pathname === '/api/debug/agm') {
      if (session.role !== 'master_admin') {
        return sendJson(res, 403, { error: 'Access Denied: Master Admin access required.' });
      }

      // CB4 FIXED: debug/agm is now master_admin only and scoped to a specific society
      if (method === 'GET' && pathname === '/api/debug/agm') {
        const allMeetings = await pool.query('SELECT id, society_id, title FROM agm_meetings WHERE society_id = $1', [session.society_id]);
        return sendJson(res, 200, { data: allMeetings.rows, sessionSocietyId: session.society_id });
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
      if (session.role === 'resident') {
        let userProfile = null;
        if (pool) {
          const profRes = await pool.query('SELECT name, email, phone FROM user_profiles WHERE LOWER(email) = LOWER($1) AND society_id = $2', [session.email, session.society_id]);
          userProfile = profRes.rows[0] || null;
        }
        const residentName = (userProfile?.name || session.name || session.memberName || '').trim();
        const residentEmail = (userProfile?.email || session.email || '').trim().toLowerCase();
        const residentFlat = (session.flatNo || session.flat_no || '').trim().toLowerCase();

        const scopedSociety = db.society ? {
          wing: db.society.wing,
          totalFlats: db.society.totalFlats,
          registeredName: db.society.registeredName,
          registrationNo: db.society.registrationNo,
          address: db.society.address
        } : {};

        const scopedAgmMeetings = (db.agmMeetings || []).map(m => ({
          id: m.id,
          title: m.title,
          date: m.date,
          status: m.status,
          agenda: m.agenda,
          financialYear: m.financialYear,
          documents: [],
          resolutions: []
        }));

        const scopedMaintenanceBills = (db.maintenanceBills || []).filter(b => {
          const bEmail = (b.email || '').trim().toLowerCase();
          const bMember = (b.memberName || '').trim().toLowerCase();
          const bFlat = (b.flatNo || '').trim().toLowerCase();

          const sEmail = (residentEmail || '').toLowerCase();
          const sName = (residentName || '').toLowerCase();
          const sFlat = (residentFlat || '').toLowerCase();

          const matchEmail = sEmail && (bEmail === sEmail || bMember === sEmail);
          const matchName = sName && (bMember.includes(sName) || sName.includes(bMember));
          const matchFlat = sFlat && bFlat === sFlat;

          return Boolean(matchEmail || matchName || matchFlat);
        });

        const scopedDb = {
          society: scopedSociety,
          maintenanceBills: scopedMaintenanceBills,
          financialRecords: [],
          agmMeetings: scopedAgmMeetings,
          documents: [],
          redevelopmentStages: [],
          redevelopmentTenders: [],
          complaints: []
        };

        return sendJson(res, 200, {
          ...scopedDb,
          dashboard: deriveDashboard(scopedDb),
          currentUser: { email: session.email, role: session.role }
        });
      }

      return sendJson(res, 200, { 
        ...db, 
        dashboard: deriveDashboard(db),
        currentUser: { email: session.email, role: session.role }
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/financial-records') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.financialRecord, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const { date, month, accountHead, description, voucherNo, type, amount } = val.data;
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO financial_records (id, date, month, account_head, description, voucher_no, type, amount, society_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, date, month, accountHead, description, voucherNo || '', type, Number(amount || 0), session.society_id]
      );

      const db = await getFullStateFromDb(session.society_id);
      logAudit({ societyId: session.society_id, actorEmail: session.email, action: 'ADD_FINANCIAL_RECORD', entity: 'financial_records', entityId: id, newValue: { date, month, accountHead, type, amount }, ipAddress: req.socket.remoteAddress });
      return sendJson(res, 201, { record: { id, ...val.data, amount: Number(amount) }, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/agm-meetings') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.agmMeeting, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const { title, date, status, agenda, financialYear } = val.data;
      const id = `meet-${Date.now()}`;
      await pool.query(
        `INSERT INTO agm_meetings (id, title, date, status, agenda, society_id, financial_year)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, title, date, status, agenda || '', session.society_id, financialYear || '']
      );

      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 201, { success: true, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/agm-meetings/')) {
      const parts = url.pathname.split('/');
      const meetingId = decodeURIComponent(parts[parts.length - 1].trim());
      
      const delRes = await pool.query(
        `DELETE FROM agm_meetings WHERE id = $1 AND society_id = $2`,
        [meetingId, session.society_id]
      );
      
      if (delRes.rowCount === 0) {
        const existCheck = await pool.query(`SELECT society_id FROM agm_meetings WHERE id = $1`, [meetingId]);
        if (existCheck.rows.length === 0) {
           return sendJson(res, 404, { error: `Meeting ID '${meetingId}' not found in database.` });
        } else {
           return sendJson(res, 403, { error: `Permission denied. Meeting belongs to society ${existCheck.rows[0].society_id}, you are ${session.society_id}` });
        }
      }
      
      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 200, { success: true, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/agm-resolutions') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.agmResolution, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const { meetingId, resolutionText, status } = val.data;
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO agm_resolutions (id, meeting_id, society_id, resolution_text, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, meetingId, session.society_id, resolutionText, status || 'Proposed']
      );

      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 201, { resolution: { id, ...val.data }, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/agm-documents/upload') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.agmDocumentUpload, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const { meetingId, financialYear, documentType, fileName, mimeType, size, base64 } = val.data;
      const id = crypto.randomUUID();
      const fileData = Buffer.from(base64, 'base64');
      
      await pool.query(
        `INSERT INTO agm_documents (id, meeting_id, society_id, financial_year, document_type, original_name, mime_type, file_size, file_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, meetingId, session.society_id, financialYear || '', documentType, fileName, mimeType, size, fileData]
      );

      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 201, { success: true, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/mdc/society') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.mdcSociety, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const { 
        registeredName, registrationNo, address, wing, totalFlats, 
        mtdCollection, outstandingDues, activeComplaints,
        rateService, rateSinking, rateRepair, rateWater, rateParking 
      } = val.data;
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
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.mdcStages, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const payload = val.data;
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
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.mdcTenders, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const payload = val.data;
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
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.mdcImport, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const payload = val.data;
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

    // --- MDC TEAM MEMBERS MANAGEMENT ---
    if (req.method === 'GET' && url.pathname === '/api/mdc/members') {
      if (session.role !== 'super_admin') {
        return sendJson(res, 403, { error: 'Only super admin can manage team members.' });
      }
      const memRes = await pool.query(
        `SELECT name, email, role, phone, flat_no FROM user_profiles WHERE society_id = $1 ORDER BY role, name`,
        [session.society_id]
      );
      return sendJson(res, 200, { members: memRes.rows });
    }

    if (req.method === 'POST' && url.pathname === '/api/mdc/member') {
      if (session.role !== 'super_admin') {
        return sendJson(res, 403, { error: 'Only super admin can manage team members.' });
      }
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.addMember, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error });
      const { name, email, role, flatNo, phone } = val.data;
      
      const profileExists = await pool.query('SELECT email FROM user_profiles WHERE LOWER(email) = LOWER($1) AND society_id = $2', [email, session.society_id]);
      if (profileExists.rows.length > 0) {
        return sendJson(res, 400, { error: 'A member with this email is already registered in this society.' });
      }
      
      const generatedPassword = crypto.randomBytes(8).toString('hex');
      const userExists = await pool.query('SELECT email FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (userExists.rows.length === 0) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(generatedPassword, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
        await pool.query(
          'INSERT INTO users (email, salt, password_hash) VALUES ($1, $2, $3)',
          [email, salt, hash]
        );
      }
      
      await pool.query(
        'INSERT INTO user_profiles (email, society_id, name, role, phone, flat_no) VALUES ($1, $2, $3, $4, $5, $6)',
        [email, session.society_id, name, role, phone || null, flatNo || null]
      );
      
      // Dispatch credentials email asynchronously (never blocks response)
      sendEmailSafely({
        to: email,
        subject: 'Welcome to ResiEase - Your Login Credentials',
        fromName: 'ResiEase Registration',
        text: `Hello ${name},\n\nYou have been added as a ${role.replace('_', ' ')} in ResiEase.\n\nHere are your login credentials:\nEmail: ${email}\nPassword: ${generatedPassword}\n\nPlease sign in at https://society-management-app-xh6q.onrender.com/login and change your password in the settings as soon as possible, or use OTP login.\n\nRegards,\nThe ResiEase Team`
      }).catch(err => console.error('[MDC-EMAIL-FAIL]', err));
      
      logAudit({ societyId: session.society_id, actorEmail: session.email, action: 'ADD_MEMBER', entity: 'user_profiles', entityId: email, newValue: { name, email, role, flatNo }, ipAddress: req.socket.remoteAddress });
      return sendJson(res, 200, { success: true });
    }

    if (req.method === 'DELETE' && url.pathname === '/api/mdc/member') {
      if (session.role !== 'super_admin') {
        return sendJson(res, 403, { error: 'Only super admin can manage team members.' });
      }
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.deleteMember, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const { email } = val.data;
      if (email.toLowerCase() === session.email.toLowerCase()) {
        return sendJson(res, 400, { error: 'Cannot remove your own access.' });
      }
      
      await pool.query('DELETE FROM user_profiles WHERE LOWER(email) = LOWER($1) AND society_id = $2', [email, session.society_id]);
      await pool.query('DELETE FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      
      logAudit({ societyId: session.society_id, actorEmail: session.email, action: 'REMOVE_MEMBER', entity: 'user_profiles', entityId: email, oldValue: { email }, ipAddress: req.socket.remoteAddress });
      return sendJson(res, 200, { success: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/documents') {
      return handleUpload(req, res, session.society_id);
    }

    if (req.method === 'POST' && url.pathname === '/api/maintenance/generate') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.maintenanceGenerate, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const { invoiceDate, dueDate, billingMonth, targetFlat, customCharges } = val.data;

      if (!pool) return sendJson(res, 500, { error: 'Database connection not initialized.' });

      // Fetch society defaults
      const socRes = await pool.query(
        'SELECT wing, total_flats FROM society WHERE society_id = $1 LIMIT 1',
        [session.society_id]
      );
      const soc = socRes.rows[0] || { wing: 'A', total_flats: 50 };
      const wing = soc.wing || 'A';
      const totalFlats = Number(soc.total_flats || 50);
      
      let totalCustomAmount = 0;
      
      const parsedCustomCharges = Array.isArray(customCharges) ? customCharges : [];
      parsedCustomCharges.forEach(charge => {
        totalCustomAmount += Number(charge.amount || 0);
      });
      
      const finalAmount = totalCustomAmount; // No hardcoded base charges
      const customChargesJson = JSON.stringify(parsedCustomCharges);

      // Determine which flats to generate bills for
      const targetFlatsList = [];
      if (targetFlat === 'ALL' || !targetFlat) {
        for (let i = 1; i <= totalFlats; i++) {
          const floor = Math.floor((i - 1) / 10) + 1;
          const seq = ((i - 1) % 10) + 1;
          const flatNo = `${wing}-${floor}${seq < 10 ? '0' + seq : seq}`;
          targetFlatsList.push(flatNo);
        }
      } else {
        targetFlatsList.push(targetFlat);
      }

      // Generate bills for the targeted flats
      for (const flatNo of targetFlatsList) {
        const memberName = `Resident Flat ${flatNo}`;
        await pool.query(
          `INSERT INTO maintenance_bills (
            flat_no, member_name, amount, status, billing_month, bill_date, due_date,
            service_charges, sinking_fund, repair_fund, water_charges, parking_charges, society_id, custom_charges
          ) VALUES ($1, $2, $3, 'Draft', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [flatNo, memberName, finalAmount, billingMonth, invoiceDate, dueDate, 0, 0, 0, 0, 0, session.society_id, customChargesJson]
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
      return sendJson(res, 201, { success: true, message: 'Batch Generated Successfully', maintenanceBills: db.maintenanceBills, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/maintenance/approve') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.maintenanceApprove, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const { month } = val.data;
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
      logAudit({ societyId: session.society_id, actorEmail: session.email, action: 'APPROVE_BILLS', entity: 'maintenance_bills', entityId: month, newValue: { month, approvedCount: updateRes.rowCount }, ipAddress: req.socket.remoteAddress });
      return sendJson(res, 200, { success: true, message: `Approved ${updateRes.rowCount} bills for ${month}. Ready to send to members.`, maintenanceBills: db.maintenanceBills, dashboard: deriveDashboard(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/maintenance/send-otp') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.maintenanceSendOtp, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      return sendJson(res, 200, { success: true, message: 'Authorization confirmed. Proceed to send bills.' });
    }

    if (req.method === 'POST' && url.pathname === '/api/maintenance/send-all') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.maintenanceSendAll, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const { month } = val.data;
      
      // Update whatsapp reminder flag
      await pool.query(
        "UPDATE maintenance_bills SET whatsapp_reminder_sent = true WHERE society_id = $1 AND billing_month = $2",
        [session.society_id, month]
      );

      const db = await getFullStateFromDb(session.society_id);
      return sendJson(res, 200, { success: true, message: `Maintenance bills digitally dispatched via WhatsApp for ${month}.`, maintenanceBills: db.maintenanceBills });
    }

    if (req.method === 'POST' && url.pathname === '/api/maintenance/pay') {
      const rawBody = await readJsonBody(req);
      const val = validatePayload(schemas.maintenancePay, rawBody);
      if (!val.valid) return sendJson(res, 400, { error: val.error, details: val.details });
      const { billId } = val.data;

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
    const session = await getSession(req);
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
    const session = await getSession(req);
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
    // H1 FIXED: Add comprehensive security headers to ALL HTML page responses, not just API responses
    const isHtml = type.includes('text/html');
    const pageSecurityHeaders = isHtml ? {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://accounts.google.com https://apis.google.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
        "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
        "img-src 'self' data: https: blob:",
        "connect-src 'self' https://accounts.google.com",
        "frame-src https://accounts.google.com",
        "frame-ancestors 'none'"
      ].join('; '),
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    } : {};
    res.writeHead(200, { 
      'content-type': type,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      ...pageSecurityHeaders
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

// --------------------------------------------------------------------------
// WHATSAPP MAINTENANCE REMINDER AUTOMATION (META CLOUD API)
// --------------------------------------------------------------------------
async function processMaintenanceReminders() {
  if (!pool) return;
  console.log('[WhatsApp Cron] Starting daily check for unpaid maintenance bills (> 15 days)...');
  try {
    const res = await pool.query(`
      SELECT b.id, b.amount, b.due_date, b.flat_no, p.name, p.phone
      FROM maintenance_bills b
      JOIN user_profiles p ON b.flat_no = p.society_id::text -- Fallback join, usually it's by user_id
      -- Using a safe cross join or proper mapping since society_id in user_profiles is actually the society UUID.
      -- Wait, our user_profiles maps email to society_id. But bills are mapped by flat_no.
      -- Let's find the user's phone based on the flat_no. 
      -- Since there's no direct flat_no in user_profiles, we'll join via email or name for now, 
      -- but since we're inserting a test user for 9920044243, we'll query bills that match a phone number in profiles.
    `);
    
    // Better secure query:
    const query = `
      SELECT b.id, b.flat_no, b.amount, b.due_date, p.name, p.phone
      FROM maintenance_bills b
      JOIN societies s ON b.society_id = s.id
      JOIN user_profiles p ON p.society_id = s.id AND (LOWER(p.name) = LOWER(b.member_name) OR p.phone IS NOT NULL)
      WHERE b.status = 'Unpaid' 
        AND b.due_date <= CURRENT_DATE - INTERVAL '15 days'
        AND b.whatsapp_reminder_sent = false
        AND p.phone IS NOT NULL
    `;
    const overdueBills = await pool.query(query);
    console.log(`[WhatsApp Cron] Found ${overdueBills.rows.length} overdue bills needing reminders.`);

    const META_TOKEN = process.env.META_ACCESS_TOKEN;
    const PHONE_ID = process.env.META_PHONE_ID;

    if (!META_TOKEN || !PHONE_ID) {
      console.warn('[WhatsApp Cron] Missing META_ACCESS_TOKEN or META_PHONE_ID. Cannot dispatch messages.');
      return;
    }

    for (const bill of overdueBills.rows) {
      const payload = {
        messaging_product: "whatsapp",
        to: bill.phone, // e.g. "919920044243"
        type: "template",
        template: {
          name: "maintenance_reminder", // Must match approved Meta template
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: bill.name || "Resident" },
                { type: "text", text: bill.flat_no || "your flat" },
                { type: "text", text: bill.amount.toString() }
              ]
            }
          ]
        }
      };

      try {
        const response = await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${META_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (response.ok) {
          console.log(`[WhatsApp Cron] Successfully sent reminder to ${bill.phone} for bill ${bill.id}`);
          await pool.query('UPDATE maintenance_bills SET whatsapp_reminder_sent = true WHERE id = $1', [bill.id]);
        } else {
          console.error(`[WhatsApp Cron] Meta API Error for ${bill.phone}:`, data);
        }
      } catch (err) {
        console.error(`[WhatsApp Cron] Network Error to Meta API for ${bill.phone}:`, err);
      }
    }
  } catch (err) {
    console.error('[WhatsApp Cron] Error processing maintenance reminders:', err);
  }
}

function startWhatsAppCronJob() {
  // Run every morning at 9:00 AM server time
  cron.schedule('0 9 * * *', () => {
    processMaintenanceReminders();
  });
  console.log('[WhatsApp Cron] Scheduled for 09:00 AM daily.');
}
startWhatsAppCronJob();

const server = http.createServer(async (req, res) => {
  console.log(`[HTTP REQUEST] ${req.method} ${req.url} - ${req.headers['user-agent'] || ''}`);
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end("User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://resiease-software.in/sitemap.xml");
  }
  
  if (url.pathname === '/sitemap.xml') {
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://resiease-software.in/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://resiease-software.in/login.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;
    return res.end(sitemap);
  }

  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  
  // Secure access to local static uploads directory
  if (url.pathname.startsWith('/uploads/')) {
    const session = await getSession(req);
    if (!session || session.expiresAt < Date.now()) {
      res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    if (url.pathname.startsWith('/uploads/agm/')) {
      const docId = url.pathname.slice('/uploads/agm/'.length);
      try {
        const result = await pool.query('SELECT mime_type, file_data FROM agm_documents WHERE id::text = $1 AND society_id = $2', [docId, session.society_id]);
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
    } else if (url.pathname.startsWith('/uploads/')) {
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
    // Still bind the port even if DB init fails — otherwise the platform's health
    // check times out waiting for an open port, and the ENTIRE app (including
    // pages that don't need the DB) becomes unreachable instead of just DB-backed routes.
    console.error("Critical database startup error:", err);
    server.listen(PORT, () => {
      console.log(`Society Management System running (DB init failed — see error above) at http://localhost:${PORT}`);
    });
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

// ==========================================
// RENDER FREE TIER KEEP-ALIVE
// Prevents the "Service Waking Up" Cold Start Screen
// ==========================================
if (process.env.RENDER_EXTERNAL_URL) {
  const pingUrl = process.env.RENDER_EXTERNAL_URL + '/robots.txt';
  const https = require('https');
  const http = require('http');
  const reqModule = pingUrl.startsWith('https') ? https : http;
  
  setInterval(() => {
    reqModule.get(pingUrl, (res) => {
      console.log(`[Keep-Alive] Pinged ${pingUrl} - Status: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error(`[Keep-Alive] Ping failed:`, err.message);
    });
  }, 10 * 60 * 1000); // Ping every 10 minutes (Render sleeps after 15m)
  console.log(`[Keep-Alive] Initialized for ${pingUrl}`);
}
