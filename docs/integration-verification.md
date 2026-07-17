# Apps Script Integration Verification

This file is the evidence template for an owner-run smoke test on a dedicated Gmail account using only fictional messages. Automated Node.js stubs do not prove live Gmail, Apps Script trigger, label, Spreadsheet, or OpenAI account behavior.

## Current status

- Locally verified code commit: `607039a9e53a051694e7348cdd33cc2419bb7773`
- Local verification date: 2026-07-17
- Test date: pending
- Environment: dedicated test Gmail account
- Result: **not yet independently executed**
- Real client data used: no

Do not change the result to passed until every step below has been executed in the dedicated account and reviewed. Do not publish account email, Gmail message IDs, spreadsheet IDs, API keys, request bodies, or screenshots containing personal data.

## Owner-run evidence checklist

| Step | Expected result | Actual result | Pass |
|---|---|---|---|
| Deploy the reviewed commit with locked `clasp` | `Code.gs` and manifest match the commit | Pending | Pending |
| Run `setupClassifier()` twice | One trigger, managed labels, accessible error sheet | Pending | Pending |
| Run the fictional provider smoke test | Completed structured classification | Pending | Pending |
| Classify a fictional invoice | Message remains unread; invoice and processed labels applied | Pending | Pending |
| Add a reply in the same thread | New message is classified independently | Pending | Pending |
| Repeat the classifier | Processed message is not sent twice | Pending | Pending |
| Force a safe provider failure | Review/error behavior contains no message content or secret | Pending | Pending |
| Delete the error spreadsheet and rerun setup | Replacement sheet is created and diagnostic row recorded | Pending | Pending |
| Verify retention with an expired fictional row | Only expired data rows are deleted | Pending | Pending |

After execution, record the full commit SHA, UTC date, Apps Script runtime, configured model snapshot, expected versus actual results, and reviewer name or role. Describe this as a portfolio verification, not a client implementation.

## Automated evidence already completed

The code commit above passed 30 deterministic tests with 96.95% statements, 94.03% branches, 100% functions, and 96.89% lines on the instrumented `src/Code.gs`. These results verify local logic and Apps Script service stubs only. They do not change the pending status of the dedicated-account integration checklist.
