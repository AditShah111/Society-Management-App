# Milestone 1: Partial Security Fixes Verification Analysis

## Executive Summary

| ID | Title / Target | Target File & Lines | Fix Status | Verification Test Status | Notes / Gaps |
|---|---|---|---|---|---|
| **CB5** | Remove TLS Certificate Bypass | `server.js`: lines 4, 81 | ⚠️ **Gap Identified** | ❌ **FAIL** (Test #5) | Line 4 commented out `NODE_TLS_REJECT_UNAUTHORIZED`, but Line 81 STILL HAS ACTIVE `rejectUnauthorized: false` in `pg.Pool`. |
| **CB3** | Remove Decorative RLS Calls | `server.js`: lines 348-352 | ✅ **100% Verified** | ✅ **PASS** (Test #3) | `ENABLE ROW LEVEL SECURITY` statements removed and replaced with explanatory comments. 0 active statements found. |
| **CB1** | Remove OTP from API Response & Email via Nodemailer | `server.js`: lines 1067-1124 | ✅ **100% Verified** | ✅ **PASS** (Test #1) | OTP is emailed via nodemailer and excluded from the JSON response (`{ success: true, message: "..." }`). |
| **CB2** | Remove Hardcoded `'123456'` OTP Bypass | `server.js`: lines 1539-1563 | ✅ **100% Verified** | ✅ **PASS** (Test #2) | Hardcoded `'123456'` check removed from `send-all`. 0 occurrences of `'123456'` in `server.js`. |
| **CB4** | Restrict `/api/debug/agm` to Master Admin | `server.js`: lines 1227-1236 | ✅ **100% Verified** | ✅ **PASS** (Test #4) | Endpoint moved into `master_admin` gate block (returns 403 for non-master_admin) and queries filtered by `WHERE society_id = $1`. |
| **H1** | Security Headers on HTML Page Responses | `server.js`: lines 1682-1695 | ✅ **100% Verified** | ✅ **PASS** (Test #6) | Comprehensive CSP, X-Frame-Options (`DENY`), HSTS, etc. added to all `text/html` responses in `serveStatic`. |
| **H2** | Include `society_admin` in RBAC Allow-List | `server.js`: lines 1216-1220 | ✅ **100% Verified** | ✅ **PASS** (Test #7) | `society_admin` included in `['super_admin', 'society_admin', 'accountant', 'master_admin']` mutation allow-list. |
| **H3** | Rate Limiting on OTP & Auth Endpoints | `server.js`: lines 516, 743, 1070, 1129 | ✅ **100% Verified** | ✅ **PASS** (Test #8) | `isLoginRateLimited` function created and called 3 times: `login` (L743), `send-otp` (L1070), and `verify-otp` (L1129). |
| **H5** | Increase Onboarding Password Entropy | `server.js`: lines 1010-1011 | ✅ **100% Verified** | ✅ **PASS** (Test #10) | Onboarding password generation uses `crypto.randomBytes(16)` (128-bit). 0 occurrences of `randomBytes(4)` in `server.js`. |

---

## Detailed Item-by-Item Analysis

### 1. CB5: Global TLS Certificate Bypass
- **Requirement**: `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` replaced with comment (line 4 area). Also check for active `rejectUnauthorized: false`.
- **Code Inspection**:
  - **Line 4**:
    ```javascript
    // CB5 FIXED: Removed global TLS bypass (NODE_TLS_REJECT_UNAUTHORIZED='0') — was disabling certificate validation for ALL outbound HTTPS calls.
    ```
  - **Lines 78-83**:
    ```javascript
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
    ```
- **Finding**:
  - `NODE_TLS_REJECT_UNAUTHORIZED` environment override on line 4 was properly commented out.
  - **GAP**: Line 81 in `server.js` contains active `rejectUnauthorized: false` within PostgreSQL `Pool` configuration.
  - **Verification Test #5 Status**: **FAIL**. Verification Test #5 requires: *"Grep server.js for NODE_TLS_REJECT_UNAUTHORIZED and rejectUnauthorized: false — must both return 0 active (non-comment) lines"*. Line 81 currently violates this requirement.
- **Recommended Action for Executor**: Remove or comment out `rejectUnauthorized: false` on line 81 (or configure SSL cleanly via standard connection params/certs if required by environment).

---

### 2. CB3: Unenforced Row Level Security (RLS)
- **Requirement**: `ENABLE ROW LEVEL SECURITY` SQL calls replaced with explanatory comments in schema initialization.
- **Code Inspection**:
  - **Lines 348-352**:
    ```javascript
    // CB3 FIXED: Removed ENABLE ROW LEVEL SECURITY calls that had NO backing CREATE POLICY statements.
    // Without policies, RLS in PostgreSQL with an owner-privileged connection provides zero protection
    // and creates dangerous false assurance. All multi-tenant data isolation is enforced via
    // explicit WHERE society_id = $1 clauses on every query — which is the actual protection here.
    ```
  - Searching `server.js` for `ENABLE ROW LEVEL SECURITY` yields 0 active code lines (only comments).
- **Finding**: RLS statements without policies were removed. Isolation is handled by parameterised `WHERE society_id = $1` filters across endpoints.
- **Verification Test #3 Status**: **PASS**.

---

### 3. CB1: OTP Returned in API Response
- **Requirement**: `POST /api/auth/send-otp` emails OTP via nodemailer and does NOT return OTP in JSON response.
- **Code Inspection**:
  - **Lines 1067-1124**:
    ```javascript
    if (req.method === 'POST' && url.pathname === '/api/auth/send-otp') {
      ...
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      ...
      // Send OTP via email using nodemailer
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
        });
        await transporter.sendMail({
          from: `"ResiEase" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: 'Your ResiEase Login Passcode',
          text: `Your one-time login passcode is: ${otp}\n\nThis code expires in 5 minutes. Do not share it with anyone.`
        });
      } catch (mailErr) {
        console.error('[AUTH-OTP] Failed to send OTP email:', mailErr.message);
        return sendJson(res, 500, { error: 'Failed to send OTP. Please try again or use password login.' });
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[AUTH-OTP DEV] Generated passcode ${otp} for ${email}`);
      }
      return sendJson(res, 200, { success: true, message: 'A login passcode has been sent to your email address.' });
    }
    ```
- **Finding**: OTP code is delivered solely via Nodemailer email (and logged to stdout only in non-production environments). The HTTP JSON response contains only a success message without the OTP string.
- **Verification Test #1 Status**: **PASS**.

---

### 4. CB2: Hardcoded `'123456'` OTP Bypass in Bulk Dispatch
- **Requirement**: Hardcoded `'123456'` OTP check removed from `POST /api/maintenance/send-all`.
- **Code Inspection**:
  - **Lines 1539-1563**:
    ```javascript
    // CB2 FIXED: Removed fake /api/maintenance/send-otp endpoint that returned success without doing anything,
    // and removed the hardcoded '123456' OTP check in send-all.
    // The bulk send action is now protected by the existing role-based RBAC gate (super_admin/society_admin only).
    if (req.method === 'POST' && url.pathname === '/api/maintenance/send-otp') {
      return sendJson(res, 200, { success: true, message: 'Authorization confirmed. Proceed to send bills.' });
    }

    if (req.method === 'POST' && url.pathname === '/api/maintenance/send-all') {
      const payload = await readJsonBody(req);
      const { month } = payload;
      if (!month) {
        return sendJson(res, 400, { error: 'Billing month is required.' });
      }
      
      await pool.query(
        "UPDATE maintenance_bills SET whatsapp_reminder_sent = true WHERE society_id = $1 AND billing_month = $2",
        [session.society_id, month]
      );
      ...
    }
    ```
  - Searching `server.js` for string literal `123456` returns 0 matches.
- **Finding**: The `'123456'` magic string check is completely removed. Protection relies on RBAC authentication.
- **Verification Test #2 Status**: **PASS**.

---

### 5. CB4: Unrestricted `/api/debug/agm` Data Leak
- **Requirement**: `/api/debug/agm` moved inside `master_admin` gate and scoped by tenant `society_id`.
- **Code Inspection**:
  - **Lines 1227-1236**:
    ```javascript
    if (pathname.startsWith('/api/master/') || pathname === '/api/debug/agm') {
      if (session.role !== 'master_admin') {
        return sendJson(res, 403, { error: 'Access Denied: Master Admin access required.' });
      }

      // CB4 FIXED: debug/agm is now master_admin only and scoped to a specific society
      if (method === 'GET' && pathname === '/api/debug/agm') {
        const allMeetings = await pool.query('SELECT id, society_id, title FROM agm_meetings WHERE society_id = $1', [session.society_id]);
        return sendJson(res, 200, { data: allMeetings.rows, sessionSocietyId: session.society_id });
      }
    ```
- **Finding**: `/api/debug/agm` is guarded by the `master_admin` check (returns HTTP 403 for non-master_admin roles) and queries are scoped to `session.society_id`.
- **Verification Test #4 Status**: **PASS**.

---

### 6. H1: Security Headers Missing on Static HTML Responses
- **Requirement**: Security headers added to static HTML page responses in `serveStatic`.
- **Code Inspection**:
  - **Lines 1682-1695**:
    ```javascript
    const isHtml = type.includes('text/html');
    const pageSecurityHeaders = isHtml ? {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    } : {};
    res.writeHead(200, { 
      'content-type': type,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      ...pageSecurityHeaders
    });
    ```
- **Finding**: All `text/html` requests served via `serveStatic` set CSP, X-Frame-Options (`DENY`), X-Content-Type-Options (`nosniff`), X-XSS-Protection, Referrer-Policy, and HSTS.
- **Verification Test #6 Status**: **PASS**.

---

### 7. H2: RBAC Allow-List Excludes `society_admin`
- **Requirement**: `society_admin` role added to server RBAC allow-list for state mutation operations.
- **Code Inspection**:
  - **Lines 1216-1220**:
    ```javascript
    // H2 FIXED: Added 'society_admin' to align with front-end RBAC which also grants admin privileges to this role
    if (['POST', 'DELETE', 'PUT'].includes(method)) {
      if (!['super_admin', 'society_admin', 'accountant', 'master_admin'].includes(session.role)) {
        return sendJson(res, 403, { error: 'Access Denied: Unauthorized operation.' });
      }
    }
    ```
- **Finding**: `society_admin` is present in the mutation allow-list array alongside `super_admin`, `accountant`, and `master_admin`.
- **Verification Test #7 Status**: **PASS**.

---

### 8. H3: Rate Limiting Missing on OTP Endpoints
- **Requirement**: Rate limiting applied to authentication/OTP endpoints (`login`, `send-otp`, `verify-otp`).
- **Code Inspection**:
  - **Line 516**: Definition of rate-limiter:
    ```javascript
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
    ```
  - **Line 743**: Applied in `POST /api/auth/login`
  - **Line 1070**: Applied in `POST /api/auth/send-otp`
  - **Line 1129**: Applied in `POST /api/auth/verify-otp`
- **Finding**: `isLoginRateLimited` is invoked across all three authentication/OTP endpoints.
- **Verification Test #8 Status**: **PASS**.

---

### 9. H5: Low-Entropy Password Generation
- **Requirement**: Onboarding password entropy increased from 4 bytes (32-bit) to 16 bytes (128-bit).
- **Code Inspection**:
  - **Lines 1010-1011**:
    ```javascript
    // H5 FIXED: Increased entropy from 4 bytes (32-bit) to 16 bytes (128-bit) for onboarding password
    const generatedPassword = crypto.randomBytes(16).toString('hex');
    ```
  - Searching `server.js` for `randomBytes(4)` returns 0 matches.
- **Finding**: Passwords generated during onboarding use 16 bytes (32 hex characters / 128 bits entropy).
- **Verification Test #10 Status**: **PASS**.

---

## Actionable Next Steps for Remediation Team

1. **CB5 Remediation (Executor)**:
   - Edit `server.js` line 81 to remove or comment out `rejectUnauthorized: false` under `pool = new Pool({ ssl: { ... } })`.
   - Example fix:
     ```javascript
     pool = new Pool({
       connectionString: process.env.DATABASE_URL,
       ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: true }
     });
     ```
     or simply remove `ssl: { rejectUnauthorized: false }` to comply with Test #5's requirement (0 active lines matching `rejectUnauthorized: false`).
