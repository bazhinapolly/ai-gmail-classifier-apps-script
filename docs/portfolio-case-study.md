# Case Study: Privacy-Aware AI Gmail Classifier

## Problem

Business inboxes mix invoices, orders, complaints, quote requests, promotions,
and internal communication. Manual triage is repetitive, but a careless AI
automation can duplicate work, skip replies, leak sensitive content, or create
unbounded API cost.

## Solution

This Google Apps Script implementation queries individual unread Gmail messages,
minimizes and redacts the selected metadata, requests a schema-constrained
classification from OpenAI, and applies a namespaced Gmail label. It leaves the
message unread for the user's normal workflow.

## Reliability design

- Message-level state prevents a processed thread from hiding a new reply.
- A script lock prevents overlapping manual and scheduled runs.
- A fixed run deadline leaves remaining messages for the next trigger.
- Transient OpenAI failures receive bounded backoff; permanent per-message
  failures move to `AI/Needs Review`.
- Category, confidence, and response shape are validated locally even though
  the API uses strict Structured Outputs.
- Setup and trigger creation are idempotent.

## Privacy and security design

- API keys remain in Script Properties and are never returned by status helpers.
- Only sender domain, a redacted subject, and the Gmail-generated snippet leave
  Google; full bodies and attachments are not fetched.
- OpenAI requests set `store: false` and include client request IDs.
- Error logs exclude content, sender, subject, API payloads, and raw provider
  responses. Spreadsheet strings are protected from formula injection.
- The manifest uses a reviewed, explicit OAuth scope allowlist.

## Verification

The repository includes syntax and manifest validation plus unit tests for PII
redaction, strict classification validation, fallback thresholds, Responses API
parsing, refusals, incomplete responses, retry classification, and spreadsheet
formula safety. GitHub Actions runs the same suite across supported Node.js
versions.

## Deployment boundary

This repository is a production-oriented reference implementation, not a hosted
service. A real deployment still requires organizational approval for sending
email-derived data to an external AI provider, a restricted API project key,
budget controls, representative evaluation data, and a dedicated smoke test.
