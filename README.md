# AI Gmail Email Classifier

Google Apps Script automation that classifies unread Gmail emails with OpenAI and applies Gmail labels automatically.

This portfolio project is designed for small business inbox workflows where incoming emails need to be sorted into clear operational categories such as invoices, orders, complaints, quote requests, marketing, internal communication, and other.

## What It Does

- Runs on a time-driven trigger every 5 minutes
- Reads unread Gmail inbox emails in safe batches
- Sends subject, sender, and the first 500 body characters to OpenAI
- Classifies each email into a configurable category
- Applies the matching Gmail label
- Adds a processed label so the same email is not classified twice
- Falls back to `Egyéb` / `Other` when confidence is low
- Logs errors to Google Sheets with timestamp, subject, and error details
- Stores the OpenAI API key in Script Properties instead of hardcoding it

## Tech Stack

- Google Apps Script
- GmailApp
- SpreadsheetApp
- OpenAI Chat Completions API
- Time-driven Apps Script triggers

## Project Structure

```text
ai-gmail-classifier-apps-script/
  Code.gs
  appsscript.json
  README.md
  portfolio-case-study.md
  AI-Gmail-Classifier-Case-Study.pdf
  AI-Gmail-Classifier-Technical-Summary.pdf
```

## Configuration 

Categories are stored at the top of Code.gs:

```javascript
CATEGORIES: [
  { id: "invoice", label: "Számla", description: "Invoices..." },
  { id: "order", label: "Megrendelés", description: "Orders..." },
  { id: "complaint", label: "Reklamáció", description: "Complaints..." },
  { id: "quote_request", label: "Ajánlatkérés", description: "Quote requests..." },
  { id: "marketing", label: "Marketing", description: "Newsletters..." },
  { id: "internal", label: "Belső", description: "Internal communication..." },
  { id: "other", label: "Egyéb", description: "Fallback category..." }
]
```

A client can add, rename, or remove categories without changing the main workflow logic.

## Setup Steps

1. Create a new Google Apps Script project.
2. Copy the contents of Code.gs into the script editor.
3. Open `Project Settings`.
4. Add a Script Property:

```text
OPENAI_API_KEY = your_openai_api_key
```

5. Run `setupRequiredLabels()` once to create Gmail labels.
6. Run `createFiveMinuteTrigger()` once to create the 5-minute trigger.
7. Authorize Gmail, Spreadsheet, Script Properties, and external request permissions when prompted.
8. Optionally run `testClassifierWithSampleEmail()` to test OpenAI classification with sample content.

## Main Functions

- `classifyUnreadEmails()`  
  Main function that processes unread inbox emails.

- `createFiveMinuteTrigger()`  
  Creates the 5-minute time-driven trigger.

- `setupRequiredLabels()`  
  Creates all category labels and the processed label.

- `testClassifierWithSampleEmail()`  
  Sends a sample email payload to OpenAI for testing.

## Reliability Notes

- Processes a maximum of 20 threads per run to stay inside Apps Script execution limits.
- Uses a processed Gmail label to avoid duplicate classification.
- Uses `temperature: 0` for more consistent classification.
- Requests JSON output from OpenAI and validates the returned category.
- Uses a confidence threshold before applying non-fallback labels.
- Logs API, parsing, and runtime errors instead of failing silently.

## Portfolio Context

This is a portfolio case study built to show how Gmail, Google Apps Script, OpenAI, and Google Sheets can work together in a practical business inbox automation workflow. It uses realistic production patterns such as Script Properties, batching, error handling, Gmail labels, processed-email tracking, and setup documentation, so it can be adapted quickly for a real client project.
