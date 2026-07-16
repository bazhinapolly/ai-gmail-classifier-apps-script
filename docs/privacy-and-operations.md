# Privacy and Operations Guide

## Data sent to OpenAI

For each eligible Gmail message, the script sends:

- the subject after basic email, phone, and long-number redaction;
- only the sender's domain, not the full sender address;
- the Gmail-generated snippet, truncated to 500 characters and passed through
  the same basic redaction.

It does not fetch or send attachments or the complete message body. Redaction
uses simple patterns and cannot guarantee anonymization. Names, addresses,
account identifiers, health information, trade secrets, and other sensitive
content may still appear in ordinary text.

Before deployment, confirm that the account owner and organization authorize
this data transfer and that it complies with applicable contracts, policies,
law, retention requirements, and the OpenAI account's data controls.

## Credential safety

- Use a dedicated OpenAI project key, not a personal all-purpose key.
- Set project budgets and usage alerts.
- Limit Apps Script editors: project editors can access Script Properties.
- Never paste a key into source, GitHub Actions, logs, or screenshots.
- Rotate the key after personnel changes or suspected exposure.

## Gmail authorization

The script requests `gmail.modify` because it searches messages and manages
labels. It does not request the broader `mail.google.com` scope and does not
send, delete, archive, or mark messages read. Review the manifest before every
deployment.

The trigger acts as its creator and processes that creator's mailbox. Deploy a
separate project copy per account. Shared and delegated inboxes require a
different architecture and explicit testing.

## Failure behavior

- Overlapping runs are skipped.
- The batch is limited to 10 messages and a 225-second work window, leaving
  additional time for the current request and graceful completion.
- Temporary network, rate-limit, and server failures receive at most three
  total attempts.
- A permanent message-specific failure gets `AI/Needs Review` and is excluded
  from later automated runs.
- Authentication, authorization, missing-credit, and missing-key errors stop the
  current run so the account is not flooded with identical errors.
- Logging failures are reported to the Apps Script execution log and do not
  terminate the remaining batch.

Error sheets contain message IDs and diagnostic metadata, not email content.
Gmail message IDs are still operational metadata and should be access-controlled.
Rows older than `ERROR_LOG_RETENTION_DAYS` are removed automatically during
setup and before a new error is logged. The default is 90 days. The mailbox
owner is responsible for selecting an approved period, restricting sheet
access, reviewing the deletion behavior, and applying any legal hold policy.

## Deployment smoke test

Use a dedicated Gmail test account and non-sensitive fictional messages.

1. Run `npm run check` locally.
2. Deploy both files in `src/` and add a restricted `OPENAI_API_KEY`.
3. Run `setupClassifier()` twice; confirm there is still exactly one trigger.
4. Run `getClassifierStatus()`; confirm the key value is never returned.
5. Run `testClassifierWithSampleEmail()` and inspect the execution result.
6. Send a fictional invoice message and run `classifyUnreadEmails()`.
7. Confirm the message remains unread and receives `AI/Invoice` plus
   `AI/Processed`.
8. Reply in the same conversation with a different fictional category; confirm
   the new message is independently classified.
9. Run the classifier again; confirm processed messages are not sent twice.
10. Temporarily use an invalid model name; confirm safe error metadata is logged
    without subject, sender, body, API key, or raw provider response.
11. Restore configuration and inspect Apps Script execution logs and OpenAI
    usage before enabling scheduled processing.
12. Set a short test retention period, add an expired fictional row, run
    `pruneErrorLog()`, and confirm only expired data rows are deleted.

## Monitoring

Review periodically:

- Apps Script failed executions and quota warnings;
- the `Classifier Errors` sheet and `AI/Needs Review` label;
- OpenAI project spend, rate limits, and request volume;
- classification accuracy using approved, representative examples;
- category definitions and false-positive/false-negative patterns;
- current Google Apps Script and OpenAI API documentation before upgrades.
