# Original User Request

## 2026-08-06T19:33:05Z

<USER_REQUEST>
# ResiEase Security Remediation — Full Audit Fix

You are a team of 4 specialized agents working together to fix critical security vulnerabilities in a live SaaS application called ResiEase (a society management platform for housing societies). This is a /goal task — do not stop until every finding is fixed, tested, and deployed.

Working directory: C:\Users\ajay_\OneDrive\Desktop\desktop\Society App

## Team Roles (self-organize strictly as follows)

- **Cyber Security Orchestrator**: Controls the findings. Reads the audit report below. Assigns tasks to the Executor. Reviews every change the Executor makes before it is committed. Acts as the final authority on whether a fix is correct.
- **Executor**: Implements all code changes to `server.js`, `index.html`, and `package.json`. Does NOT deploy — only edits files and reports back to the Orchestrator and Supervisor for review.
- **Cyber Security Tester**: After every batch of fixes is committed, tests each vulnerability fix independently. Reports pass/fail with evidence (curl output, code grep results, or logic review). Must test CB1, CB2, CB3, CB4, CB5, H1, H2, H3, H4, H5, C4.
- **Supervisor**: Watches the Executor at all times. Catches any regressions, missed fixes, or incomplete implementations. Blocks deployment if any critical finding is not fully resolved.

## Source Files

- Backend: `C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\server.js` (1880 lines)
- Frontend dashboard: `C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\index.html` (3253 lines)
- Dependencies: `C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\package.json`
- Deploy via: `git add . && git commit -m "..." && git push origin main` from working directory

## Current Status (partial fixes already applied by previous agent — verify each one)

The following changes were applied to server.js but NOT yet committed or pushed. The team must verify each one, complete any remaining work, then deploy everything together:

- CB5: `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` replaced with a comment (verify line 4)
- CB3: RLS ENABLE calls replaced with a comment (verify lines 348-353 area)
- CB1: `send-otp` endpoint now emails OTP via nodemailer and does NOT return it in response (verify)
- CB2: Hardcoded `'123456'` OTP check removed from `send-all` (verify)
- CB4: `/api/debug/agm` moved inside master_admin gate (verify)
- H1: Security headers added to serveStatic HTML responses (verify)
- H2: `society_admin` added to RBAC allow-list (verify)
- H3: Rate limiting applied to OTP endpoints (verify)
- H5: Password entropy increased to 16 bytes (verify)

## Remaining Work (NOT yet done — Executor must complete these)

### H4 — Remove dangerous unused devDependencies from package.json
Remove these 4 packages from `devDependencies` in package.json:
- `@aws-sdk/client-ec2`
- `archiver`
- `cloudflared`
- `ssh2`

Then run: `npm install` to update package-lock.json

### C4 — Scope /api/state by role
In server.js, the `GET /api/state` handler calls `getFullStateFromDb(session.society_id)` and returns everything to any role including `resident`. Fix this so residents only receive:
- `society` (general info only, not financial rates)
- `agmMeetings` (public meeting info only, no documents or resolutions)
- Their own bills from `maintenanceBills` (filter by matching member email or flat)
- Empty arrays for `financialRecords`, `complaints`, `documents`, `redevelopmentStages`, `redevelopmentTenders`

### C1 — innerHTML XSS audit in index.html
Search index.html for all `innerHTML` assignments that interpolate user-sourced data (member names, bill amounts, complaint text, society names, etc.). Replace them with safe DOM creation using `textContent` or sanitized string building. Focus on the highest-risk instances where data originates from the database (member names, descriptions, titles, agenda text). At minimum wrap all such interpolations in an escapeHtml() helper function:
```javascript
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
```
Add this function early in the script and wrap all `${meeting.title}`, `${meeting.agenda}`, `${r.resolutionText}`, `${complaint.title}`, `${complaint.description}`, `${bill.memberName}`, `${bill.flatNo}` etc. with `escapeHtml()`.

## Critical Security Findings Reference (Claude Audit Report)

| ID | Finding | Severity |
|---|---|---|
| CB1 | OTP returned in API response — full account takeover | Critical |
| CB2 | Hardcoded `'123456'` OTP bypass on bulk invoice dispatch | Critical |
| CB3 | RLS enabled with no policies — decorative, not protective | Critical |
| CB4 | `/api/debug/agm` — unrestricted cross-tenant data leak | Critical |
| CB5 | TLS certificate validation disabled process-wide | Critical |
| C1 | Stored XSS via unescaped innerHTML (34 call sites) | Critical |
| C4 | Full unscoped /api/state for all roles including resident | Critical |
| H1 | No CSP/HSTS/frame headers on HTML page responses | High |
| H2 | RBAC allow-list excludes society_admin (role-model drift) | High |
| H3 | No rate limiting on OTP endpoints | High |
| H4 | Unused high-privilege devDependencies in package.json | High |
| H5 | Onboarding: low-entropy (32-bit) password | Medium-High |

## Verification Tests (Tester must run each)

1. **CB1 test**: `curl -s -X POST https://society-management-app-xh6q.onrender.com/api/auth/send-otp -H 'Content-Type: application/json' -d '{"email":"test@test.com"}' | grep -i otp` — must return no `otp` field
2. **CB2 test**: Grep server.js for `123456` — must return 0 results
3. **CB3 test**: Grep server.js for `ENABLE ROW LEVEL SECURITY` — must return 0 results (or only inside a comment)
4. **CB4 test**: Access `/api/debug/agm` with a resident session cookie — must return 403
5. **CB5 test**: Grep server.js for `NODE_TLS_REJECT_UNAUTHORIZED` and `rejectUnauthorized: false` — must both return 0 active (non-comment) lines
6. **H1 test**: Check response headers on `GET /` and `GET /login` — must include `Content-Security-Policy` and `X-Frame-Options: DENY`
7. **H2 test**: Grep server.js for the RBAC allow-list — must include `society_admin`
8. **H3 test**: Grep server.js for `isLoginRateLimited` — must appear at least 3 times (login + send-otp + verify-otp)
9. **H4 test**: Check package.json devDependencies — must NOT contain ssh2, cloudflared, archiver, @aws-sdk/client-ec2
10. **H5 test**: Grep server.js for `randomBytes(4)` — must return 0 results
11. **C4 test**: Call `/api/state` with a resident session — response must not contain `financialRecords` with data
12. **C1 test**: Grep index.html for `escapeHtml` — must appear throughout innerHTML interpolations

## Deployment

After Orchestrator + Supervisor approve all fixes and Tester confirms all 12 tests pass:
```
git add .
git commit -m "security: fix CB1-CB5 + H1-H5 + C1 + C4 per Claude audit"
git push origin main
```

Do not stop until all 12 verification tests pass and the code is deployed to Render.

## Acceptance Criteria
- [ ] All 12 tester verification checks pass
- [ ] No `otp` field in send-otp API response
- [ ] No `123456` anywhere in server.js
- [ ] No active `NODE_TLS_REJECT_UNAUTHORIZED` in server.js
- [ ] `/api/debug/agm` returns 403 for non-master_admin
- [ ] CSP header present on HTML page responses
- [ ] package.json has no dangerous devDependencies
- [ ] escapeHtml() wraps all user-data innerHTML in index.html
- [ ] Code deployed and Render build succeeds

</USER_REQUEST>
