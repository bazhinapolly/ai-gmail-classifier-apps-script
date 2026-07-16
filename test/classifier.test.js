const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadScript(overrides = {}) {
  const context = vm.createContext({
    console: { log() {}, error() {} },
    ...overrides
  });
  const source = readFileSync(join(__dirname, "../src/Code.gs"), "utf8");
  vm.runInContext(source, context, { filename: "src/Code.gs" });
  return {
    call(expression) {
      return vm.runInContext(expression, context);
    }
  };
}

test("buildPendingQuery_ excludes processed and review messages", () => {
  const script = loadScript();
  assert.equal(
    script.call("buildPendingQuery_()"),
    'in:inbox is:unread -label:"AI/Processed" -label:"AI/Needs Review"'
  );
});

test("buildEmailInput_ minimizes and redacts personal data", () => {
  const script = loadScript();
  const value = script.call(`buildEmailInput_({
    snippet: "Call +1 (202) 555-0123 or mail alice@example.com about 1234567890123456",
    payload: {headers: [
      {name: "From", value: "Alice <alice@Example.COM>"},
      {name: "Subject", value: "Contact alice@example.com"}
    ]}
  })`);
  assert.deepEqual(JSON.parse(JSON.stringify(value)), {
    subject: "Contact [email]",
    senderDomain: "example.com",
    bodySnippet: "Call [phone] or mail [email] about [long-number]"
  });
});

test("strict classification accepts a valid result", () => {
  const script = loadScript();
  const value = script.call(
    'validateClassification_({categoryId:"invoice",confidence:0.9,reason:"Invoice terms."})'
  );
  assert.equal(value.categoryId, "invoice");
});

for (const invalidConfidence of ["0.9", NaN, Infinity, -0.1, 1.1]) {
  test(`strict classification rejects confidence ${String(invalidConfidence)}`, () => {
    const script = loadScript();
    const literal = Number.isNaN(invalidConfidence)
      ? "NaN"
      : invalidConfidence === Infinity
        ? "Infinity"
        : JSON.stringify(invalidConfidence);
    assert.throws(
      () =>
        script.call(
          `validateClassification_({categoryId:"invoice",confidence:${literal},reason:"x"})`
        ),
      /finite number/
    );
  });
}

test("strict classification rejects unknown and extra fields", () => {
  const script = loadScript();
  assert.throws(
    () =>
      script.call(
        'validateClassification_({categoryId:"unknown",confidence:0.9,reason:"x"})'
      ),
    /unknown category/
  );
  assert.throws(
    () =>
      script.call(
        'validateClassification_({categoryId:"invoice",confidence:0.9,reason:"x",extra:true})'
      ),
    /required schema/
  );
});

test("resolveCategory_ sends low confidence to AI/Other", () => {
  const script = loadScript();
  assert.equal(
    script.call(
      'resolveCategory_({categoryId:"invoice",confidence:0.64,reason:"unclear"}).id'
    ),
    "other"
  );
  assert.equal(
    script.call(
      'resolveCategory_({categoryId:"invoice",confidence:0.65,reason:"clear"}).id'
    ),
    "invoice"
  );
});

test("parseOpenAIResponse_ finds output text without assuming array position", () => {
  const script = loadScript();
  const response = JSON.stringify({
    status: "completed",
    output: [
      { type: "reasoning", content: [] },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              categoryId: "order",
              confidence: 0.94,
              reason: "Order confirmation."
            })
          }
        ]
      }
    ]
  });
  const value = script.call(`parseOpenAIResponse_(${JSON.stringify(response)})`);
  assert.equal(value.categoryId, "order");
});

test("parseOpenAIResponse_ handles refusal and incomplete responses", () => {
  const script = loadScript();
  const refusal = JSON.stringify({
    status: "completed",
    output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }]
  });
  const incomplete = JSON.stringify({
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: []
  });
  assert.throws(
    () => script.call(`parseOpenAIResponse_(${JSON.stringify(refusal)})`),
    /refused/
  );
  assert.throws(
    () => script.call(`parseOpenAIResponse_(${JSON.stringify(incomplete)})`),
    /incomplete/
  );
});

test("OpenAI payload disables storage and constrains category ids", () => {
  const script = loadScript();
  const payload = script.call(
    'buildOpenAIPayload_({subject:"x",senderDomain:"example.com",bodySnippet:"y"}, "gpt-test")'
  );
  assert.equal(payload.store, false);
  assert.equal(payload.model, "gpt-test");
  assert.equal(payload.text.format.type, "json_schema");
  assert.equal(payload.text.format.strict, true);
  assert.deepEqual(
    Array.from(payload.text.format.schema.properties.categoryId.enum),
    ["invoice", "order", "complaint", "quote_request", "marketing", "internal", "other"]
  );
});

test("label update is atomic and never adds and removes the same category", () => {
  let modification;
  const script = loadScript({
    Gmail: {
      Users: {
        Messages: {
          modify(resource, userId, messageId) {
            modification = { resource, userId, messageId };
          }
        }
      }
    }
  });
  script.call(`applyClassificationLabels_(
    {id:"message-1",labelIds:["old-category","selected-category","review"]},
    {id:"invoice",label:"AI/Invoice"},
    {byName:{
      "AI/Processed":{id:"processed"},
      "AI/Needs Review":{id:"review"},
      "AI/Invoice":{id:"selected-category"},
      "AI/Order":{id:"old-category"},
      "AI/Complaint":{id:"complaint"},
      "AI/Quote Request":{id:"quote"},
      "AI/Marketing":{id:"marketing"},
      "AI/Internal":{id:"internal"},
      "AI/Other":{id:"other"}
    }}
  )`);
  assert.deepEqual(JSON.parse(JSON.stringify(modification)), {
    resource: {
      addLabelIds: ["selected-category", "processed"],
      removeLabelIds: ["old-category", "review"]
    },
    userId: "me",
    messageId: "message-1"
  });
});

test("spreadsheet cells are protected from formula injection", () => {
  const script = loadScript();
  assert.equal(script.call('escapeSpreadsheetText_("=IMPORTDATA(\\"x\\")")'), "'=IMPORTDATA(\"x\")");
  assert.equal(script.call('escapeSpreadsheetText_("safe")'), "safe");
});

test("provider errors are sanitized and classify retryability", () => {
  const script = loadScript();
  const error = script.call(`createProviderError_(429,
    JSON.stringify({error:{code:"rate_limit_exceeded",message:"sensitive provider text"}}),
    {"x-request-id":"req_123"}, "client_123", 2)`);
  assert.equal(error.code, "rate_limit_exceeded");
  assert.equal(error.retryable, true);
  assert.equal(error.requestId, "req_123");
  assert.equal(error.message.includes("sensitive provider text"), false);
});

test("invalid provider requests stop the run without exposing raw errors", () => {
  const script = loadScript();
  const error = script.call(`createProviderError_(400,
    JSON.stringify({error:{code:"invalid_request_error",message:"raw detail"}}),
    {}, "client_400", 1)`);
  assert.equal(error.retryable, false);
  assert.equal(error.fatal, true);
  assert.equal(error.markForReview, false);
  assert.equal(error.message.includes("raw detail"), false);
});

test("retry delay uses exponential fallback when Retry-After is absent", () => {
  const sleeps = [];
  const script = loadScript({
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    Utilities: { sleep(milliseconds) { sleeps.push(milliseconds); } }
  });
  script.call("sleepBeforeRetry_(2, {})");
  script.call('sleepBeforeRetry_(2, {"Retry-After":"3"})');
  assert.deepEqual(sleeps, [2000, 3000]);
});

function createManagedLabels() {
  const names = [
    "AI/Processed", "AI/Needs Review", "AI/Invoice", "AI/Order",
    "AI/Complaint", "AI/Quote Request", "AI/Marketing", "AI/Internal", "AI/Other"
  ];
  return names.map((name, index) => ({ id: `label-${index}`, name }));
}

test("classifyUnreadEmails orchestrates one message and is safe to repeat", () => {
  const labels = createManagedLabels();
  const processedId = labels.find((item) => item.name === "AI/Processed").id;
  const message = {
    id: "message-1", labelIds: [], snippet: "Invoice attached",
    payload: { headers: [
      { name: "From", value: "Billing <billing@example.com>" },
      { name: "Subject", value: "June invoice" }
    ] }
  };
  let released = 0;
  let modifications = 0;
  const properties = { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" };
  const script = loadScript({
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { released += 1; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] || null }) },
    Gmail: { Users: {
      Labels: { list: () => ({ labels }), create: () => { throw new Error("unexpected label creation"); } },
      Messages: {
        list: () => ({ messages: [{ id: message.id }] }), get: () => message,
        modify(resource) {
          modifications += 1;
          message.labelIds = message.labelIds.filter((id) => !resource.removeLabelIds.includes(id))
            .concat(resource.addLabelIds.filter((id) => !message.labelIds.includes(id)));
        }
      }
    } }
  });
  script.call('classifyEmailWithOpenAI_=function(){return {categoryId:"invoice",confidence:0.98,reason:"Invoice"};}');
  const first = script.call("classifyUnreadEmails()");
  const second = script.call("classifyUnreadEmails()");
  assert.equal(first.processed, 1);
  assert.equal(second.skipped, 1);
  assert.equal(modifications, 1);
  assert.equal(message.labelIds.includes(processedId), true);
  assert.equal(released, 2);
});

test("classifyUnreadEmails stops the batch after a fatal provider error", () => {
  const labels = createManagedLabels();
  let messageReads = 0;
  const script = loadScript({
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => key === "OPENAI_API_KEY" ? "key" : null }) },
    Gmail: { Users: {
      Labels: { list: () => ({ labels }) },
      Messages: {
        list: () => ({ messages: [{ id: "one" }, { id: "two" }] }),
        get(id) { messageReads += 1; return { id, labelIds: [], payload: { headers: [] }, snippet: "x" }; },
        modify() {}
      }
    } }
  });
  script.call('logErrorSafely_=function(){}');
  script.call('classifyEmailWithOpenAI_=function(){var error=new Error("safe");error.fatal=true;throw error;}');
  const summary = script.call("classifyUnreadEmails()");
  assert.equal(summary.errors, 1);
  assert.equal(summary.stoppedEarly, true);
  assert.equal(messageReads, 1);
});

test("setupClassifier is idempotent across labels, sheet, and trigger", () => {
  const labels = [];
  const triggers = [];
  const properties = { OPENAI_API_KEY: "key" };
  const sheet = {
    rows: [], appendRow(row) { this.rows.push(row); }, getLastRow() { return this.rows.length; },
    getRange() { return { getValues: () => [] }; }, deleteRow() {},
    getParent: () => ({ getUrl: () => "https://example.invalid/sheet" })
  };
  const spreadsheet = { getId: () => "sheet-id", getUrl: () => "https://example.invalid/sheet", getSheetByName: () => sheet, insertSheet: () => sheet };
  let createdSpreadsheets = 0;
  const script = loadScript({
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] || null, setProperty: (key, value) => { properties[key] = value; } }) },
    Gmail: { Users: { Labels: {
      list: () => ({ labels }),
      create(value) { const label = { id: `id-${labels.length}`, name: value.name }; labels.push(label); return label; }
    } } },
    SpreadsheetApp: { create() { createdSpreadsheets += 1; return spreadsheet; }, openById: () => spreadsheet },
    ScriptApp: {
      getProjectTriggers: () => triggers, deleteTrigger() {},
      newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {
        const trigger = { getHandlerFunction: () => "classifyUnreadEmails", getUniqueId: () => "trigger-1" };
        triggers.push(trigger); return trigger;
      } }) }) })
    }
  });
  const first = script.call("setupClassifier()");
  const second = script.call("setupClassifier()");
  assert.equal(first.status, "ready");
  assert.equal(second.triggerId, "trigger-1");
  assert.equal(labels.length, 9);
  assert.equal(triggers.length, 1);
  assert.equal(createdSpreadsheets, 1);
});

test("error-log retention removes only expired data rows", () => {
  const removed = [];
  const values = [[new Date("2026-01-01T00:00:00Z")], [new Date("2026-06-15T00:00:00Z")], ["not-a-date"]];
  const script = loadScript({ PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => key === "ERROR_LOG_RETENTION_DAYS" ? "90" : null }) } });
  const sheet = { getLastRow: () => 4, getRange: () => ({ getValues: () => values }), deleteRow: (row) => removed.push(row) };
  const context = vm.createContext({ sheet, now: new Date("2026-07-17T00:00:00Z") });
  context.prune = script.call("pruneErrorLogSheet_");
  assert.equal(context.prune(sheet, context.now), 1);
  assert.deepEqual(removed, [2]);
});
