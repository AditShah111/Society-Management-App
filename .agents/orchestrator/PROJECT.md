# Project: ResiEase Security Remediation

## Architecture
ResiEase SaaS application (Node.js/Express backend in `server.js`, single-page HTML/JS dashboard frontend in `index.html`, dependencies in `package.json`).

## Feature Inventory
| # | Finding / Feature | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | CB1 | OTP returned in API response — full account takeover | M1 | ORIGINAL_REQUEST |
| 2 | CB2 | Hardcoded '123456' OTP bypass on bulk invoice dispatch | M1 | ORIGINAL_REQUEST |
| 3 | CB3 | RLS enabled with no policies — decorative, not protective | M1 | ORIGINAL_REQUEST |
| 4 | CB4 | `/api/debug/agm` — unrestricted cross-tenant data leak | M1 | ORIGINAL_REQUEST |
| 5 | CB5 | TLS certificate validation disabled process-wide | M1 | ORIGINAL_REQUEST |
| 6 | H1 | Security headers added to serveStatic HTML responses | M1 | ORIGINAL_REQUEST |
| 7 | H2 | `society_admin` added to RBAC allow-list | M1 | ORIGINAL_REQUEST |
| 8 | H3 | Rate limiting applied to OTP endpoints | M1 | ORIGINAL_REQUEST |
| 9 | H5 | Password entropy increased to 16 bytes | M1 | ORIGINAL_REQUEST |
| 10 | H4 | Remove unused high-privilege devDependencies in package.json | M2 | ORIGINAL_REQUEST |
| 11 | C4 | Scope `/api/state` by role | M2 | ORIGINAL_REQUEST |
| 12 | C1 | Stored XSS via unescaped innerHTML in index.html | M2 | ORIGINAL_REQUEST |
| 13 | Verification | Run all 12 verification tests & forensic audit | M3 | ORIGINAL_REQUEST |
| 14 | Deployment | Git commit & push, victory report | M4 | ORIGINAL_REQUEST |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Verify Partial Fixes | Verify CB1-CB5, H1-H3, H5 in server.js (CB5 gap found: line 81) | None | DONE |
| M2 | Remaining Work Implementation | Fix CB5 (line 81), H4 (package.json), C4 (server.js), C1 (index.html) | M1 | DONE |
| M3 | Full Testing & Audit | Verify all 12 tests via tester, reviewers, challengers, forensic auditor | M2 | IN_PROGRESS |
| M4 | Deploy & Final Report | Commit, push, victory report | M3 | PLANNED |

## Code Layout
- `server.js` — Backend Express server
- `index.html` — Frontend SPA
- `package.json` — Node project config & dependencies
