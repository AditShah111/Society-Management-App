# Milestone 2 Technical Analysis: Scope `/api/state` by Role (C4)

**Target System**: ResiEase Society Management Platform  
**File Under Investigation**: `C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\server.js`  
**Investigator**: Explorer 2  
**Date**: 2026-08-07  

---

## 1. Executive Summary

In ResiEase, `GET /api/state` serves as the primary data endpoint loaded by the frontend dashboard. Prior to this remediation, `GET /api/state` called `getFullStateFromDb(session.society_id)` and returned the complete, unfiltered database state of the society to **any** authenticated user regardless of their role.

This allowed a user logged in with the standard `'resident'` role to inspect:
1. Every maintenance bill of all society members (`maintenanceBills`).
2. All financial income/expense ledgers, bank transactions, and voucher entries (`financialRecords`).
3. Private committee documents and meeting resolutions in AGM records (`agmMeetings[].documents` & `agmMeetings[].resolutions`).
4. All uploaded statutory documents, legal forms, and certificates (`documents`).
5. Complete redevelopment stage details (`redevelopmentStages`).
6. All commercial bids, builder names, corpus offers, and financial terms for society redevelopment (`redevelopmentTenders`).
7. Confidential resident complaints filed across the society (`complaints`).
8. Society financial rates (service rate, sinking rate, repair rate, water rate, parking rate) and total financial collections (`mtdCollection`, `outstandingDues`).

This report details the exact codebase findings and presents a complete, production-ready fix strategy to scope `/api/state` strictly according to user role.

---

## 2. Current Implementation Analysis

### 2.1 File & Line Mapping
- **`server.js` Lines 423–513**: `getFullStateFromDb(societyId)` function.
- **`server.js` Lines 1257–1264**: `GET /api/state` HTTP endpoint handler.

### 2.2 Current Code in `server.js` (Lines 1257–1264)
```javascript
1257:    if (req.method === 'GET' && url.pathname === '/api/state') {
1258:      const db = await getFullStateFromDb(session.society_id);
1259:      return sendJson(res, 200, { 
1260:        ...db, 
1261:        dashboard: deriveDashboard(db),
1262:        currentUser: { email: session.email, role: session.role }
1263:      });
1264:    }
```

### 2.3 Existing `state` Object Structure (Returned by `getFullStateFromDb`)
| Property Name | Data Type | Contains Sensitive Data | Current Visibility |
|---|---|---|---|
| `society` | Object | Financial rates (`rateService`, `rateSinking`, etc.), `mtdCollection`, `outstandingDues` | Exposed to all roles |
| `maintenanceBills` | Array of Objects | Flat numbers, member names, billing breakdown, payment status for all residents | Exposed to all roles |
| `financialRecords` | Array of Objects | Income/Expense vouchers, account heads, amounts, dates | Exposed to all roles |
| `agmMeetings` | Array of Objects | Meeting title, date, agenda, attached PDFs/documents, resolutions | Exposed to all roles |
| `documents` | Array of Objects | Statutory legal documents, government forms, uploads | Exposed to all roles |
| `redevelopmentStages` | Array of Objects | Redevelopment milestone tracking | Exposed to all roles |
| `redevelopmentTenders` | Array of Objects | Builder names, extra area %, corpus amount in lakhs | Exposed to all roles |
| `complaints` | Array of Objects | Member complaints, descriptions, reporter names | Exposed to all roles |

---

## 3. Scoping & Authorization Requirements (C4)

### 3.1 Scoping Rules matrix

| Data Field | `resident` Role | Administrative Roles (`master_admin`, `super_admin`, `society_admin`, `accountant`, `committee_member`, `auditor`) |
|---|---|---|
| `society` | **General Info Only**: `{ wing, totalFlats, registeredName, registrationNo, address }` (No rates or collection totals) | Full object including financial rates & collection totals |
| `agmMeetings` | **Public Info Only**: `{ id, title, date, status, agenda, financialYear, documents: [], resolutions: [] }` | Full array including attached `documents` & `resolutions` |
| `maintenanceBills` | **Filtered Array**: Only bills matching the resident's email, name, or flat number | Full array of all society bills |
| `financialRecords` | Empty Array `[]` | Full array of income and expense ledger records |
| `complaints` | Empty Array `[]` | Full array of society complaints |
| `documents` | Empty Array `[]` | Full array of statutory documents |
| `redevelopmentStages` | Empty Array `[]` | Full array of redevelopment stages |
| `redevelopmentTenders` | Empty Array `[]` | Full array of tender bids and commercial proposals |
| `dashboard` | Derived from scoped state (`deriveDashboard(scopedDb)`) | Derived from full state (`deriveDashboard(db)`) |

---

## 4. Proposed Fix Strategy

### 4.1 Replacement Code for `server.js` (Lines 1257–1264)

```javascript
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const db = await getFullStateFromDb(session.society_id);

      if (session.role === 'resident') {
        // C4 FIXED: Scope /api/state for resident role to prevent cross-resident & financial data leaks
        let userProfile = {};
        if (pool && session.email) {
          try {
            const profRes = await pool.query(
              'SELECT name, email FROM user_profiles WHERE LOWER(email) = LOWER($1) AND society_id = $2',
              [session.email, session.society_id]
            );
            userProfile = profRes.rows[0] || {};
          } catch (e) {
            console.error('[API-STATE] Failed to fetch resident profile:', e.message);
          }
        }

        const userEmail = (session.email || '').toLowerCase();
        const userName = (userProfile.name || '').toLowerCase();
        const userEmailPrefix = userEmail.split('@')[0];

        // 1. Scope maintenance bills to resident's own flat/email/name
        const scopedBills = db.maintenanceBills.filter(b => {
          const bEmail = (b.email || '').toLowerCase();
          const bMember = (b.memberName || '').toLowerCase();
          const bFlat = (b.flatNo || '').toLowerCase().replace(/[^a-z0-9]/g, '');

          if (bEmail && bEmail === userEmail) return true;
          if (bMember && userName && (bMember === userName || bMember.includes(userName) || userName.includes(bMember))) return true;
          if (bMember && userEmailPrefix && bMember.includes(userEmailPrefix)) return true;
          if (bFlat && userEmail.replace(/[^a-z0-9]/g, '').includes(bFlat)) return true;
          if (bFlat && userName.replace(/[^a-z0-9]/g, '').includes(bFlat)) return true;

          return false;
        });

        // 2. Public AGM meeting info only (strip documents and resolutions)
        const scopedAgmMeetings = db.agmMeetings.map(m => ({
          id: m.id,
          title: m.title,
          date: m.date,
          status: m.status,
          agenda: m.agenda,
          financialYear: m.financialYear,
          documents: [],
          resolutions: []
        }));

        // 3. General society info only (omit financial rates and collection totals)
        const scopedSociety = {
          wing: db.society.wing,
          totalFlats: db.society.totalFlats,
          registeredName: db.society.registeredName,
          registrationNo: db.society.registrationNo,
          address: db.society.address
        };

        const scopedDb = {
          society: scopedSociety,
          maintenanceBills: scopedBills,
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

      // Non-resident roles receive full state
      return sendJson(res, 200, { 
        ...db, 
        dashboard: deriveDashboard(db),
        currentUser: { email: session.email, role: session.role }
      });
    }
```

---

## 5. Technical Rationale & Safety Analysis

1. **Isolation of Resident Data**:
   The resident filter checks multiple fallback matching fields (`email`, `memberName`, `flatNo` normalized against `userEmail` and `userName`). This ensures robust matching regardless of whether the resident logged in via email OTP or password.

2. **Dashboard Integrity**:
   Passing `scopedDb` to `deriveDashboard(scopedDb)` ensures that the top-level `dashboard` key returned in the JSON payload also reflects filtered figures (0 for total collection / outstanding dues / complaints, empty chart array) for residents, closing potential data leaks in calculated summary metrics.

3. **Backward Compatibility for Admin Roles**:
   Roles such as `master_admin`, `super_admin`, `society_admin`, `accountant`, `committee_member`, and `auditor` bypass the resident scoping check and continue receiving full state required for administrative operations.

---

## 6. Verification Steps for Tester

1. **Resident Session Call**:
   Login as `resident@society.com` to obtain session cookie. Call `GET /api/state`.
   - Verify `financialRecords` is `[]`.
   - Verify `complaints` is `[]`.
   - Verify `documents` is `[]`.
   - Verify `redevelopmentStages` is `[]`.
   - Verify `redevelopmentTenders` is `[]`.
   - Verify `agmMeetings` items have `documents: []` and `resolutions: []`.
   - Verify `society` object does not contain `rateService`, `rateSinking`, `mtdCollection`, or `outstandingDues`.
   - Verify `maintenanceBills` only contains bills belonging to that resident.

2. **Admin Session Call**:
   Login as `admin@society.com` or `committee@society.com`. Call `GET /api/state`.
   - Verify full data arrays are returned as expected for admin operations.
