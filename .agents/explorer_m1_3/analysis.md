# Analysis: Milestone 2 (C1 & H4) Audit

## Executive Summary
This document provides the full analysis for Milestone 2 remediation:
1. **H4**: Verification of `package.json` `devDependencies` to identify lines containing unused/high-privilege packages to be removed.
2. **C1**: Comprehensive audit of `index.html` (3252 lines) for `innerHTML` assignments, check for `escapeHtml()` helper presence, and complete mapping of all call sites and string interpolations that require `escapeHtml()` protection against stored/reflected XSS.

---

## 1. Package.json Audit (H4)

### File Inspected
`C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\package.json`

### Lines 20-25 Content
```json
20:   "devDependencies": {
21:     "@aws-sdk/client-ec2": "^3.1094.0",
22:     "archiver": "^8.0.0",
23:     "cloudflared": "^0.7.1",
24:     "ssh2": "^1.17.0"
25:   }
```

### Action Required for H4
Remove lines 21 to 24 (or clear `devDependencies` section to `{}`) from `package.json`:
- `@aws-sdk/client-ec2` (line 21)
- `archiver` (line 22)
- `cloudflared` (line 23)
- `ssh2` (line 24)

After removing these lines, `package.json` `devDependencies` block will be empty or cleanly formatted, followed by running `npm install`.

---

## 2. index.html innerHTML XSS Audit (C1)

### File Inspected
`C:\Users\ajay_\OneDrive\Desktop\desktop\Society App\index.html` (3252 lines total)

### `escapeHtml()` Function Check
Currently, `escapeHtml()` function **DOES NOT EXIST** anywhere in `index.html`.
It must be added early inside the main `<script>` block (around line 1290, near helper functions like `money` and `shortDate`).

Proposed helper implementation:
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

---

### Detailed Call Site Analysis for `innerHTML` Assignments

Total `innerHTML` assignment call sites identified: **18 call sites** (generating dynamic HTML blocks with user-supplied or database fields).

Below is the complete list of call sites, line numbers, variable interpolations, and required `escapeHtml()` wrappers:

#### 1. Line 1407 (`renderDashboard`)
- **Code**: `eventCard.querySelector('.font-bold').innerHTML = \`<i class="fa-solid fa-gavel mr-2"></i> \${agm.title}\`;`
- **User Data**: `agm.title`
- **Required Fix**: Wrap `agm.title` in `escapeHtml(agm.title)`.

#### 2. Line 1426 (`renderRedevelopment`)
- **Code**: `addressSpan.innerHTML = \`<i class="fa-solid fa-location-dot text-brand-400"></i> \${state.society.address}\`;`
- **User Data**: `state.society.address`
- **Required Fix**: Wrap `state.society.address` in `escapeHtml(state.society.address)`.

#### 3. Lines 1443-1447 (`renderRedevelopment` - Empty steps)
- **Code**: Static HTML string (`stepsContainer.innerHTML = ...`).
- **User Data**: None (static text).
- **Required Fix**: Safe as static string.

#### 4. Lines 1461-1500 (`renderRedevelopment` - Steps timeline)
- **Code**: `stepsContainer.innerHTML = html;` where `html` interpolates `stage.name` (line 1494) and `stage.subText` (line 1495).
- **User Data**: `stage.name`, `stage.subText`
- **Required Fix**: Wrap `stage.name` in `escapeHtml(stage.name)` and `stage.subText` in `escapeHtml(stage.subText)`.

#### 5. Lines 1506-1521 (`renderRedevelopment` - Builder Tenders list)
- **Code**: `tendersContainer.innerHTML = state.redevelopmentTenders.length ? state.redevelopmentTenders.map(t => ... \${t.builderName} ... \${t.extraAreaPct} ... \${t.corpusAmountLakhs} ... \${t.status} ...)`
- **User Data**: `t.builderName`, `t.status` (and numeric fields `t.extraAreaPct`, `t.corpusAmountLakhs`).
- **Required Fix**: Wrap `t.builderName` in `escapeHtml(t.builderName)` and `t.status` in `escapeHtml(t.status)`.

#### 6. Lines 1527-1541 (`renderRedevelopment` - Redevelopment Documents list)
- **Code**: `redevelopmentDocsList.innerHTML = redevDocs.length ? redevDocs.map(d => ... \${d.title} ... \${d.url} ...)`
- **User Data**: `d.title`, `d.url`
- **Required Fix**: Wrap `d.title` in `escapeHtml(d.title)` and `d.url` in `escapeHtml(d.url)`.

#### 7. Lines 1576-1602 (`populateMdcFormInputs` - Stages grid)
- **Code**: `stagesGrid.innerHTML = stagesToRender.map(stage => ... value="\${stage.name}" ... value="\${stage.subText}" ...)`
- **User Data**: `stage.name`, `stage.subText` in input value attributes.
- **Required Fix**: Wrap `stage.name` in `escapeHtml(stage.name)` and `stage.subText` in `escapeHtml(stage.subText)`.

#### 8. Lines 1623-1636 (`addNewTenderRow`)
- **Code**: `tr.innerHTML = \` ... value="\${builderName}" ... \`;`
- **User Data**: `builderName`
- **Required Fix**: Wrap `builderName` in `escapeHtml(builderName)`.

#### 9. Lines 1734-1786 (`renderMaintenance` - Bills table body)
- **Code**: `tbody.innerHTML = bills.length ? bills.map(bill => ... \${bill.flatNo} ... \${bill.memberName} ... \${bill.billingMonth} ... \${bill.id} ...)`
- **User Data**: `bill.flatNo`, `bill.memberName`, `bill.billingMonth`, `bill.id`
- **Required Fix**: Wrap `bill.flatNo`, `bill.memberName`, `bill.billingMonth`, `bill.id` in `escapeHtml()`.

#### 10. Lines 1870-1883 (`viewBillInvoice` - Custom charges)
- **Code**: `customTbody.innerHTML = ...` / `tr.innerHTML = \` ... \${charge.name} ... \`;`
- **User Data**: `charge.name`
- **Required Fix**: Wrap `charge.name` in `escapeHtml(charge.name)`.

#### 11. Line 1920-1923 (`addCustomChargeRow`)
- **Code**: `row.innerHTML = ...` with static HTML inputs.
- **User Data**: None initial.
- **Required Fix**: Safe.

#### 12. Line 1978-1983 (`addIbRow`)
- **Code**: `row.innerHTML = \` ... value="\${name}" ... placeholder="\${hint}" ... \`;`
- **User Data**: `name`, `hint`
- **Required Fix**: Wrap `name` in `escapeHtml(name)` and `hint` in `escapeHtml(hint)`.

#### 13. Lines 2156-2165 & 2171-2180 (`renderFinancialStatements` - Expense & Income tables)
- **Code**: `expenseTbody.innerHTML = ...` / `incomeTbody.innerHTML = ...` interpolating `head` (`To ${head}`, `By ${head}`).
- **User Data**: `head` (account head string).
- **Required Fix**: Wrap `head` in `escapeHtml(head)`.

#### 14. Lines 2197-2204 & 2211-2217 (`renderFinancialStatements` - Balance sheet tables)
- **Code**: `liabTbody.innerHTML = ...` / `assetTbody.innerHTML = ...`
- **User Data**: Calculated numeric balances; static labels.
- **Required Fix**: Numeric format safe, but wrapping any text labels in `escapeHtml` is good defensive practice.

#### 15. Lines 2234-2245 (`renderLedger`)
- **Code**: `tbody.innerHTML = records.slice(0, 12).map(record => ... \${record.accountHead} ... \${record.description} ... \${record.voucherNo} ...)`
- **User Data**: `record.accountHead`, `record.description`, `record.voucherNo`
- **Required Fix**: Wrap `record.accountHead`, `record.description`, `record.voucherNo` in `escapeHtml()`.

#### 16. Lines 2260-2310 (`renderAgm` - AGM Meetings & Resolutions list)
- **Code**: `container.innerHTML = filteredMeetings.map(meeting => ... \${meeting.title} ... \${meeting.status} ... \${meeting.agenda} ... \${meeting.id} ... \${r.resolutionText} ... \${r.status} ...)`
- **User Data**: `meeting.title`, `meeting.status`, `meeting.agenda`, `meeting.id`, `r.resolutionText`, `r.status`
- **Required Fix**: Wrap `meeting.title`, `meeting.status`, `meeting.agenda`, `meeting.id`, `r.resolutionText`, `r.status` in `escapeHtml()`.

#### 17. Lines 2344-2358 (`populateAgmYearDropdowns`)
- **Code**: `filterSelect.innerHTML = generateOptions(...)` / `modalSelect.innerHTML = ...` interpolating `y` (financial year string like `"2024-2025"`).
- **User Data**: `y`
- **Required Fix**: Wrap `y` in `escapeHtml(y)`.

#### 18. Lines 2409-2426 (`renderDocuments` - Uploaded documents list)
- **Code**: `list.innerHTML = documents.length ? documents.map(document => ... \${document.title} ... \${document.category} ... \${document.url} ... \${document.id} ...)`
- **User Data**: `document.title`, `document.category`, `document.url`, `document.id`
- **Required Fix**: Wrap `document.title`, `document.category`, `document.url`, `document.id` in `escapeHtml()`.

---

## 3. Summary of Remediations
1. **package.json**: Delete lines 21-24 (`@aws-sdk/client-ec2`, `archiver`, `cloudflared`, `ssh2`).
2. **index.html**:
   - Add `escapeHtml(str)` definition at line ~1290.
   - Wrap all 18 dynamic HTML interpolation points in `escapeHtml(...)`.
