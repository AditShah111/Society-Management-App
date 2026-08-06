# Handoff Report: Milestone 2 — C4 Scope `/api/state` by Role

**Agent**: Explorer 2  
**Working Directory**: `C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\.agents\explorer_m1_2`  
**Target File**: `C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\server.js`  
**Handoff Type**: Hard Handoff (Task Analysis Complete)  

---

## 1. Observation

### 1.1 Source Code Findings (`server.js`)

In `server.js` lines 1257–1264:
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

In `server.js` lines 423–513:
```javascript
423: async function getFullStateFromDb(societyId) {
424:   const state = {
425:     society: { wing: 'A', totalFlats: 48, registeredName: 'Lotus Co-operative Housing Society Ltd.', registrationNo: 'MUM/WP/HSG/TC/12345/2026', address: 'Plot 42, Sector 15, Vashi, Navi Mumbai, Maharashtra 400703' },
426:     maintenanceBills: [],
427:     financialRecords: [],
428:     agmMeetings: [],
429:     documents: [],
430:     redevelopmentStages: [],
431:     redevelopmentTenders: [],
432:     complaints: []
433:   };
...
512:   return state;
513: }
```

### 1.2 Identified Security Vulnerability (Finding C4)
`GET /api/state` fetches full society state using `getFullStateFromDb(session.society_id)` and returns all properties to any authenticated request, regardless of `session.role`. Consequently, a resident user calling `/api/state` receives financial records, all members' maintenance bills, confidential complaints, statutory documents, redevelopment tenders, and internal AGM documents/resolutions.

---

## 2. Logic Chain

1. **Premise 1**: Session authentication is performed prior to line 1257, establishing `session.role`, `session.email`, and `session.society_id`.
2. **Premise 2**: Currently, line 1258 calls `getFullStateFromDb(session.society_id)` and immediately outputs `...db` without role-based data filtering.
3. **Premise 3**: For users with `session.role === 'resident'`, security policy C4 mandates:
   - `society`: General info only (`wing`, `totalFlats`, `registeredName`, `registrationNo`, `address`), omitting financial rates (`rateService`, `rateSinking`, `rateRepair`, `rateWater`, `rateParking`) and financial collection metrics (`mtdCollection`, `outstandingDues`).
   - `agmMeetings`: Public info only (`id`, `title`, `date`, `status`, `agenda`, `financialYear`), stripping `documents` and `resolutions` arrays to empty `[]`.
   - `maintenanceBills`: Filtered to items matching the resident's session email, member name, or flat number.
   - `financialRecords`, `complaints`, `documents`, `redevelopmentStages`, `redevelopmentTenders`: Set to empty arrays `[]`.
   - `dashboard`: Derived using `deriveDashboard(scopedDb)` to ensure summary metrics do not leak financial totals.
4. **Premise 4**: For administrative roles (`master_admin`, `super_admin`, `society_admin`, `accountant`, `committee_member`, `auditor`), full state must remain accessible.
5. **Conclusion**: Inserting a role-check branch for `session.role === 'resident'` within `GET /api/state` at lines 1257–1264 satisfies all C4 requirements while maintaining compatibility for administrative roles.

---

## 3. Caveats

- **User-to-Bill Matching**: Maintenance bills in the database store `member_name` and `flat_no`, but may not always populate an explicit `email` column. The proposed filter uses multi-field matching (`email`, `memberName`, `flatNo` against `userEmail` and `userName`) to handle all bill formats cleanly.
- **No Database Schema Changes**: This scoping fix is applied in the API presentation layer (`GET /api/state`), requiring zero database migration or schema modification.

---

## 4. Conclusion

The exact code modification required in `server.js` (lines 1257–1264) is:

```javascript
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const db = await getFullStateFromDb(session.society_id);

      if (session.role === 'resident') {
        // C4 FIXED: Scope /api/state for resident role
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

      return sendJson(res, 200, { 
        ...db, 
        dashboard: deriveDashboard(db),
        currentUser: { email: session.email, role: session.role }
      });
    }
```

---

## 5. Verification Method

To independently verify this fix:

1. **Inspect Code**: Check `server.js` at line 1257 to confirm the `if (session.role === 'resident')` branch is implemented.
2. **Execute Test Check 11**:
   - Log in as a resident user (`resident@society.com`).
   - Issue `GET /api/state` with the resident session cookie.
   - Confirm response JSON has `financialRecords: []`, `documents: []`, `complaints: []`, `redevelopmentStages: []`, `redevelopmentTenders: []`.
   - Confirm `society` contains only general info (`wing`, `totalFlats`, `registeredName`, `registrationNo`, `address`) without financial rate keys (`rateService`, `rateSinking`, etc.).
   - Confirm `agmMeetings[].documents` and `agmMeetings[].resolutions` are `[]`.
   - Confirm `maintenanceBills` contains only the resident's bills.
3. **Execute Admin Check**:
   - Log in as `admin@society.com` or `committee@society.com`.
   - Issue `GET /api/state` with the admin session cookie.
   - Confirm full arrays are returned.
