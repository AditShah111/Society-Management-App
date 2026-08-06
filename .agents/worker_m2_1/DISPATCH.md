## 2026-08-07T01:10:09Z
You are the Executor (Worker) implementing the security fixes for ResiEase Security Remediation (Milestone 2).
Working Directory: C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\.agents\worker_m2_1
Read original request at: C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\.agents\ORIGINAL_REQUEST.md

MANDATORY INTEGRITY WARNING: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:

1. **CB5 Gap Fix in server.js**:
   Target File: `C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\server.js`
   Line 81 area: Remove or comment out `rejectUnauthorized: false` in `pool = new Pool({ ssl: { rejectUnauthorized: false } })` or set `ssl: process.env.DATABASE_URL ? { rejectUnauthorized: true } : false` (or remove `rejectUnauthorized: false` completely) so that grepping for `rejectUnauthorized: false` returns 0 active lines. Also verify line 4 has `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` commented out.

2. **C4 Fix in server.js**:
   Target File: `C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\server.js`
   Lines 1257-1264 (`GET /api/state` handler):
   Implement role scoping for `session.role === 'resident'`:
   - Fetch resident user profile from `user_profiles` (or fallback to session)
   - Scope `society`: general info only (`wing`, `totalFlats`, `registeredName`, `registrationNo`, `address`), omitting financial rate fields (`rateService`, `rateSinking`, etc.).
   - Scope `agmMeetings`: public meeting info only (`id`, `title`, `date`, `status`, `agenda`, `financialYear`), stripping `documents` and `resolutions` to empty `[]`.
   - Scope `maintenanceBills`: filter to matching resident session email, member name, or flat number.
   - Set `financialRecords`, `complaints`, `documents`, `redevelopmentStages`, `redevelopmentTenders` to `[]`.
   - Calculate `dashboard: deriveDashboard(scopedDb)`.
   - Return 200 with scoped JSON.
   - Non-resident roles continue receiving full state.

3. **H4 Fix in package.json**:
   Target File: `C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\package.json`
   Remove these 4 packages from `devDependencies`:
   - `@aws-sdk/client-ec2`
   - `archiver`
   - `cloudflared`
   - `ssh2`
   Execute `npm install` from working directory (`C:\Users\ajay_\OneDrive\Desktop\desktop\Society App`) to update `package-lock.json`.

4. **C1 Fix in index.html**:
   Target File: `C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\index.html`
   - Add `escapeHtml(str)` early in `<script>` (around line 1290):
     ```javascript
     function escapeHtml(str) {
       if (str === null || str === undefined) return '';
       return String(str)
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#x27;');
     }
     ```
   - Update all innerHTML interpolations rendering dynamic user/DB data (`${meeting.title}`, `${meeting.agenda}`, `${r.resolutionText}`, `${complaint.title}`, `${complaint.description}`, `${bill.memberName}`, `${bill.flatNo}`, `${doc.title}`, `${tender.builderName}`, etc.) with `escapeHtml()`.

5. Run syntax checks (`node -c server.js`) and ensure `npm install` completes cleanly.
6. Write your handoff report to `C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\.agents\worker_m2_1\handoff.md` with build/syntax output and exact changes made.

Send a message when completed.
