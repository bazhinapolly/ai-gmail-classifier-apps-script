/**
 * AI Gmail Email Classifier
 *
 * Google Apps Script demo that classifies unread Gmail messages with OpenAI,
 * applies a matching Gmail label, marks messages as processed, and logs errors
 * to Google Sheets.
 */

const CONFIG = {
  OPENAI_MODEL: "gpt-4o-mini",
  OPENAI_API_URL: "https://api.openai.com/v1/chat/completions",
  MAX_EMAILS_PER_RUN: 20,
  BODY_SNIPPET_LIMIT: 500,
  CONFIDENCE_THRESHOLD: 0.65,
  PROCESSED_LABEL: "AI/Processed",
  FALLBACK_LABEL: "Egyéb",
  ERROR_LOG_SHEET_NAME: "AI Classifier Errors",
  ERROR_LOG_SPREADSHEET_PROPERTY: "ERROR_LOG_SPREADSHEET_ID",
  OPENAI_KEY_PROPERTY: "OPENAI_API_KEY",
  CATEGORIES: [
    {
      id: "invoice",
      label: "Számla",
      description: "Invoices, receipts, payment notices, billing documents"
    },
    {
      id: "order",
      label: "Megrendelés",
      description: "Orders, purchase confirmations, delivery or fulfillment updates"
    },
    {
      id: "complaint",
      label: "Reklamáció",
      description: "Complaints, refunds, negative feedback, service issues"
    },
    {
      id: "quote_request",
      label: "Ajánlatkérés",
      description: "Quote requests, pricing questions, service inquiries"
    },
    {
      id: "marketing",
      label: "Marketing",
      description: "Newsletters, promotions, sales emails, campaigns"
    },
    {
      id: "internal",
      label: "Belső",
      description: "Internal team communication, employee or partner messages"
    },
    {
      id: "other",
      label: "Egyéb",
      description: "Fallback category for unclear or unrelated emails"
    }
  ]
};

const SYSTEM_PROMPT = [
  "You classify Gmail emails for a business inbox.",
  "Return only valid JSON with these fields:",
  "{\"categoryId\":\"one configured id\",\"confidence\":0.0,\"reason\":\"short reason\"}",
  "Use the configured category ids only.",
  "If the email is unclear, low confidence, or does not fit a category, use categoryId \"other\".",
  "Do not invent categories."
].join(" ");

function classifyUnreadEmails() {
  const processedLabel = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  const unreadThreads = GmailApp.search(
    "in:inbox is:unread -label:" + quoteGmailLabel_(CONFIG.PROCESSED_LABEL),
    0,
    CONFIG.MAX_EMAILS_PER_RUN
  );

  unreadThreads.forEach(function(thread) {
    try {
      if (threadHasLabel_(thread, CONFIG.PROCESSED_LABEL)) {
        return;
      }

      const message = thread.getMessages().slice(-1)[0];
      const emailInput = buildEmailInput_(message);
      const classification = classifyEmailWithOpenAI_(emailInput);
      const category = resolveCategory_(classification);
      const categoryLabel = getOrCreateLabel_(category.label);

      thread.addLabel(categoryLabel);
      thread.addLabel(processedLabel);
    } catch (error) {
      logError_(thread, error);
    }
  });
}

function createFiveMinuteTrigger() {
  deleteExistingClassifierTriggers_();

  ScriptApp.newTrigger("classifyUnreadEmails")
    .timeBased()
    .everyMinutes(5)
    .create();
}

function deleteExistingClassifierTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "classifyUnreadEmails") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function setupRequiredLabels() {
  getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  CONFIG.CATEGORIES.forEach(function(category) {
    getOrCreateLabel_(category.label);
  });
}

function testClassifierWithSampleEmail() {
  const sample = {
    subject: "Invoice for your June order",
    sender: "billing@example.com",
    bodySnippet: "Please find attached the invoice for your June order. Payment is due within 14 days."
  };

  Logger.log(classifyEmailWithOpenAI_(sample));
}

function buildEmailInput_(message) {
  const plainBody = message.getPlainBody() || "";

  return {
    subject: message.getSubject() || "",
    sender: message.getFrom() || "",
    bodySnippet: plainBody.substring(0, CONFIG.BODY_SNIPPET_LIMIT)
  };
}

function classifyEmailWithOpenAI_(emailInput) {
  const apiKey = getOpenAIKey_();
  const payload = {
    model: CONFIG.OPENAI_MODEL,
    temperature: 0,
    max_tokens: 160,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: JSON.stringify({
          categories: CONFIG.CATEGORIES.map(function(category) {
            return {
              id: category.id,
              label: category.label,
              description: category.description
            };
          }),
          email: emailInput
        })
      }
    ]
  };

  const response = UrlFetchApp.fetch(CONFIG.OPENAI_API_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (statusCode === 429) {
    throw new Error("OpenAI rate limit reached: " + responseText);
  }

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error("OpenAI API error " + statusCode + ": " + responseText);
  }

  const parsed = JSON.parse(responseText);
  const content = parsed.choices &&
    parsed.choices[0] &&
    parsed.choices[0].message &&
    parsed.choices[0].message.content;

  if (!content) {
    throw new Error("OpenAI response did not include a classification.");
  }

  return JSON.parse(content);
}

function resolveCategory_(classification) {
  const fallback = getFallbackCategory_();

  if (!classification || !classification.categoryId) {
    return fallback;
  }

  if (Number(classification.confidence || 0) < CONFIG.CONFIDENCE_THRESHOLD) {
    return fallback;
  }

  const matched = CONFIG.CATEGORIES.filter(function(category) {
    return category.id === classification.categoryId;
  })[0];

  return matched || fallback;
}

function getFallbackCategory_() {
  return CONFIG.CATEGORIES.filter(function(category) {
    return category.label === CONFIG.FALLBACK_LABEL || category.id === "other";
  })[0];
}

function getOpenAIKey_() {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty(CONFIG.OPENAI_KEY_PROPERTY);

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in Script Properties.");
  }

  return apiKey;
}

function getOrCreateLabel_(labelName) {
  return GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
}

function threadHasLabel_(thread, labelName) {
  return thread.getLabels().some(function(label) {
    return label.getName() === labelName;
  });
}

function quoteGmailLabel_(labelName) {
  return '"' + labelName.replace(/"/g, '\\"') + '"';
}

function logError_(thread, error) {
  const sheet = getErrorLogSheet_();
  const subject = safeThreadSubject_(thread);

  sheet.appendRow([
    new Date(),
    subject,
    error && error.message ? error.message : String(error)
  ]);
}

function safeThreadSubject_(thread) {
  try {
    return thread && thread.getFirstMessageSubject
      ? thread.getFirstMessageSubject()
      : "";
  } catch (error) {
    return "";
  }
}

function getErrorLogSheet_() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty(CONFIG.ERROR_LOG_SPREADSHEET_PROPERTY);
  let spreadsheet;

  if (spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } else {
    spreadsheet = SpreadsheetApp.create("Gmail AI Classifier Error Log");
    spreadsheetId = spreadsheet.getId();
    properties.setProperty(CONFIG.ERROR_LOG_SPREADSHEET_PROPERTY, spreadsheetId);
  }

  let sheet = spreadsheet.getSheetByName(CONFIG.ERROR_LOG_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.ERROR_LOG_SHEET_NAME);
    sheet.appendRow(["Timestamp", "Email subject", "Error message"]);
  }

  return sheet;
}
