# AI Gmail Message Classifier

[![CI](https://github.com/bazhinapolly/ai-gmail-classifier-apps-script/actions/workflows/ci.yml/badge.svg)](https://github.com/bazhinapolly/ai-gmail-classifier-apps-script/actions/workflows/ci.yml)

Privacy-aware Google Apps Script automation that classifies unread Gmail
messages with OpenAI and applies namespaced Gmail labels.

The project is intentionally message-based: a new unread reply in an existing
conversation is eligible for classification even when an earlier message in
that thread was already processed.

## Highlights

- Processes individual unread inbox messages without changing their read state
- Uses the OpenAI Responses API and strict Structured Outputs
- Sends only a redacted subject, sender domain, and Gmail-generated snippet
- Treats email content as untrusted input
- Uses `AI/...` labels to avoid collisions with ordinary Gmail labels
- Prevents overlapping trigger runs with `LockService`
- Stops before the Apps Script execution deadline
- Retries transient provider failures with bounded exponential backoff
- Sends permanent per-message failures to `AI/Needs Review`
- Writes metadata-only, formula-safe error records to Google Sheets
- Includes deterministic local tests and GitHub Actions CI

## Data flow

```text
Unread Gmail message
        │
        ▼
Metadata + Gmail snippet
        │
        ▼
Basic PII redaction ──► OpenAI Responses API (`store: false`)
        │
        ▼
Strict category schema + local validation
        │
        ▼
Category label + AI/Processed
```

No attachment or complete message body is sent. Redaction is best-effort, not a
guarantee of anonymization; review [privacy and operations](docs/privacy-and-operations.md)
before using real business email.

## Requirements

- A Google account with Gmail and Apps Script access
- An OpenAI API project key with an appropriate budget limit
- Node.js 20 or newer for local checks
- Optional: [`clasp`](https://github.com/google/clasp) for deployment

This design supports one Gmail account per copy of the Apps Script project.
Installable triggers run as the user who creates them. It is not a delegated or
shared-inbox architecture.

## Quick start with `clasp`

1. Clone the repository and install local metadata:

   ```bash
   git clone https://github.com/bazhinapolly/ai-gmail-classifier-apps-script.git
   cd ai-gmail-classifier-apps-script
   cp .clasp.json.example .clasp.json
   ```

2. Create a standalone Apps Script project at
   [script.google.com](https://script.google.com), copy its Script ID into
   `.clasp.json`, and authenticate:

   ```bash
   npx @google/clasp login
   npm run clasp:status
   npm run clasp:push
   ```

   `clasp push` replaces the files in the target Apps Script project. Use a new
   or dedicated project and always check `clasp:status` first.

3. In Apps Script, open **Project Settings → Script Properties** and add:

   ```text
   OPENAI_API_KEY = your_restricted_project_key
   ```

   Optional model override:

   ```text
   OPENAI_MODEL = gpt-4o-mini-2024-07-18
   ```

4. Run `setupClassifier()` once and approve the requested scopes. It validates
   configuration, creates managed labels and the error-log spreadsheet, and
   installs exactly one five-minute trigger.

5. Run `testClassifierWithSampleEmail()` to make one paid request using only
   fictional data. Then send a test message to the account and run
   `classifyUnreadEmails()` manually.

## Manual Apps Script installation

If you do not use `clasp`:

1. Create a standalone Apps Script project.
2. Replace `Code.gs` with [src/Code.gs](src/Code.gs).
3. Enable **Show `appsscript.json` manifest file** in Project Settings.
4. Replace the manifest with [src/appsscript.json](src/appsscript.json). This
   enables Advanced Gmail API v1 and the reviewed OAuth scopes.
5. Add `OPENAI_API_KEY` as a Script Property and run `setupClassifier()`.

Copying only `Code.gs` is not sufficient because this implementation uses the
Advanced Gmail service declared in the manifest.

## Managed labels

| Label | Purpose |
| --- | --- |
| `AI/Processed` | Message was successfully classified |
| `AI/Needs Review` | Permanent message-level failure needs manual review |
| `AI/Invoice`, `AI/Order`, … | Applied business category |
| `AI/Other` | Unknown or low-confidence classification |

The classifier removes only category labels listed in its own configuration. It
does not modify unrelated Gmail labels or the unread state.

## Public functions

- `setupClassifier()` — complete idempotent setup
- `classifyUnreadEmails()` — trigger handler and manual run
- `getClassifierStatus()` — safe configuration status without secrets
- `testClassifierWithSampleEmail()` — fictional-data API smoke test
- `createFiveMinuteTrigger()` — idempotently ensure one trigger
- `deleteClassifierTriggers()` — disable scheduled processing

## Configuration

Edit `CONFIG` in `src/Code.gs` to change categories, batch size, confidence
threshold, labels, or time budget. `validateConfig_()` rejects duplicate IDs,
duplicate labels, invalid thresholds, a missing fallback, and non-namespaced
managed labels before processing begins.

The default pinned model is `gpt-4o-mini-2024-07-18`, a small model that supports
intent classification, the Responses API, and Structured Outputs. Evaluate a
model change against representative, non-sensitive examples before deployment.

## Verification

```bash
npm install
npm run check
```

The check command validates Apps Script syntax, validates the manifest and exact
OAuth allowlist, checks repository hygiene, and runs unit tests. CI runs the
same command on Node.js 20, 22, and 24.

For a real integration test, use a dedicated Gmail test account and follow the
[smoke-test checklist](docs/privacy-and-operations.md#deployment-smoke-test).

## Uninstall

1. Run `deleteClassifierTriggers()`.
2. Delete the `AI/...` labels if they are no longer needed.
3. Delete the generated error-log spreadsheet.
4. Delete `OPENAI_API_KEY`, `OPENAI_MODEL`, and
   `ERROR_LOG_SPREADSHEET_ID` from Script Properties.
5. Revoke the script's Google account access if the project will not be reused.
6. Rotate or delete the OpenAI project key.

## License

[MIT](LICENSE)
