const assert = require("node:assert/strict");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const coverageEnabled = process.env.CODE_COVERAGE === "1";
const coverageStore = {};
const instrumenter = coverageEnabled
  ? require("istanbul-lib-instrument").createInstrumenter({ compact: false })
  : null;

if (coverageEnabled) {
  process.on("exit", () => {
    mkdirSync(join(__dirname, "../coverage"), { recursive: true });
    writeFileSync(
      join(__dirname, "../coverage/coverage-final.json"),
      JSON.stringify(coverageStore),
      "utf8"
    );
  });
}

function loadScript(overrides = {}) {
  const context = vm.createContext({
    console: { log() {}, error() {} },
    __coverage__: coverageStore,
    ...overrides
  });
  const sourcePath = join(__dirname, "../src/Code.gs");
  const source = readFileSync(sourcePath, "utf8");
  const executable = instrumenter
    ? instrumenter.instrumentSync(source, sourcePath)
    : source;
  vm.runInContext(executable, context, { filename: "src/Code.gs" });
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

test("validateConfig_ rejects invalid managed labels and runtime controls", () => {
  const cases = [
    ['CONFIG.PROCESSED_LABEL="Processed"', /managed label must start with AI/],
    ['CONFIG.NEEDS_REVIEW_LABEL=CONFIG.PROCESSED_LABEL', /Managed labels must be unique/],
    ['CONFIG.PROCESSED_LABEL=CONFIG.CATEGORIES[0].label', /Managed labels must be unique/],
    ['CONFIG.OPENAI_MAX_ATTEMPTS=0', /OPENAI_MAX_ATTEMPTS/],
    ['CONFIG.OPENAI_TIMEOUT_SECONDS=301', /OPENAI_TIMEOUT_SECONDS/],
    ['CONFIG.MAX_RUN_MS=999', /MAX_RUN_MS/]
  ];
  for (const [mutation, expected] of cases) {
    const script = loadScript({
      Gmail: { Users: {} },
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) }
    });
    script.call(mutation);
    assert.throws(() => script.call("validateConfig_(false)"), expected);
  }
});

test("getErrorLogSheet_ replaces an inaccessible stored spreadsheet", () => {
  const properties = { ERROR_LOG_SPREADSHEET_ID: "deleted-sheet" };
  const rows = [];
  const warnings = [];
  const sheet = {
    appendRow: (row) => rows.push(row),
    getParent: () => spreadsheet
  };
  const spreadsheet = {
    getId: () => "replacement-sheet",
    getSheetByName: () => sheet,
    insertSheet: () => sheet
  };
  let created = 0;
  const script = loadScript({
    console: { log() {}, error() {}, warn: (message) => warnings.push(message) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => properties[key] || null,
      setProperty: (key, value) => { properties[key] = value; },
      deleteProperty: (key) => { delete properties[key]; }
    }) },
    SpreadsheetApp: {
      openById: () => { throw new Error("not found"); },
      create: () => { created += 1; return spreadsheet; }
    }
  });

  const result = script.call("getErrorLogSheet_()");
  assert.equal(result, sheet);
  assert.equal(created, 1);
  assert.equal(properties.ERROR_LOG_SPREADSHEET_ID, "replacement-sheet");
  assert.equal(rows.length, 1);
  assert.equal(rows[0][2], "error_log_recreated");
  assert.match(warnings[0], /creating a replacement/);
});

test("public trigger, status, retention, and fictional smoke helpers are bounded", () => {
  const triggers = [
    { getHandlerFunction: () => "classifyUnreadEmails", getUniqueId: () => "first" },
    { getHandlerFunction: () => "classifyUnreadEmails", getUniqueId: () => "extra" },
    { getHandlerFunction: () => "other", getUniqueId: () => "other" }
  ];
  const deleted = [];
  const properties = { OPENAI_API_KEY: "key", ERROR_LOG_RETENTION_DAYS: "30" };
  const sheet = { getLastRow: () => 1, getParent: () => ({ getUrl: () => "https://example.invalid" }) };
  const script = loadScript({
    sheet,
    Gmail: { Users: {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] || null }) },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      deleteTrigger: (trigger) => deleted.push(trigger.getUniqueId())
    }
  });
  script.call("getErrorLogSheet_=function(){return sheet;}");
  script.call("classifyEmailWithOpenAI_=function(){return {categoryId:'invoice',confidence:0.99,reason:'Invoice'};}");
  assert.equal(script.call("pruneErrorLog()"), 0);
  assert.equal(script.call("createFiveMinuteTrigger().getUniqueId()"), "first");
  assert.deepEqual(deleted, ["extra"]);
  assert.equal(script.call("deleteClassifierTriggers()"), 2);
  const status = script.call("getClassifierStatus()");
  assert.equal(status.configured, true);
  assert.equal(status.triggerCount, 2);
  assert.equal(status.errorLogRetentionDays, 30);
  const smoke = script.call("testClassifierWithSampleEmail()");
  assert.equal(smoke.resolvedCategory, "invoice");
});

test("OpenAI adapter succeeds, retries transient failures, and fails closed", () => {
  const valid = JSON.stringify({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ categoryId: "invoice", confidence: 0.9, reason: "Invoice" }) }] }]
  });
  const responses = [
    { getResponseCode: () => 429, getAllHeaders: () => ({ "Retry-After": "0" }), getContentText: () => JSON.stringify({ error: { code: "rate_limit" } }) },
    { getResponseCode: () => 200, getContentText: () => valid }
  ];
  let sleeps = 0;
  const script = loadScript({
    Utilities: { getUuid: () => "client-id", sleep: () => { sleeps += 1; } },
    UrlFetchApp: { fetch: () => responses.shift() }
  });
  script.call("CONFIG.OPENAI_MAX_ATTEMPTS=2");
  const result = script.call("classifyEmailWithOpenAI_({subject:'x',senderDomain:'example.com',bodySnippet:'y'},'key','model')");
  assert.equal(result.categoryId, "invoice");
  assert.equal(sleeps, 1);

  const exhausted = loadScript({
    Utilities: { getUuid: () => "client-id", sleep() {} },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 500, getAllHeaders: () => ({}), getContentText: () => "{}" }) }
  });
  exhausted.call("CONFIG.OPENAI_MAX_ATTEMPTS=2");
  assert.throws(
    () => exhausted.call("classifyEmailWithOpenAI_({subject:'x',senderDomain:'x',bodySnippet:'x'},'key','model')"),
    (error) => error.retryable && error.fatal
  );

  const network = loadScript({
    Utilities: { getUuid: () => "client-id", sleep() {} },
    UrlFetchApp: { fetch: () => { throw new Error("private network detail"); } }
  });
  network.call("CONFIG.OPENAI_MAX_ATTEMPTS=2");
  assert.throws(
    () => network.call("classifyEmailWithOpenAI_({subject:'x',senderDomain:'x',bodySnippet:'x'},'key','model')"),
    (error) => error.code === "network_error" && error.fatal
  );
});

test("provider response parser rejects every incomplete output shape", () => {
  const script = loadScript();
  const cases = [
    ["not-json", /invalid JSON/],
    [JSON.stringify({ error: { code: "bad" } }), /error response/],
    [JSON.stringify({ status: "incomplete", output: [] }), /incomplete/],
    [JSON.stringify({ status: "completed", output: [] }), /did not include/],
    [JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "bad-json" }] }] }), /not valid JSON/]
  ];
  for (const [value, expected] of cases) {
    assert.throws(() => script.call(`parseOpenAIResponse_(${JSON.stringify(value)})`), expected);
  }
  for (const expression of [
    "validateClassification_(null)",
    "validateClassification_({categoryId:'missing',confidence:0.5,reason:'x'})",
    "validateClassification_({categoryId:'invoice',confidence:0.5,reason:''})",
    "validateClassification_({categoryId:'invoice',confidence:0.5,reason:'x'.repeat(501)})"
  ]) {
    assert.throws(() => script.call(expression));
  }
});

test("review labeling and error logging remain safe when secondary services fail", () => {
  const errors = [];
  const rows = [];
  let modifyCalls = 0;
  const sheet = {
    getLastRow: () => 1,
    appendRow: (row) => rows.push(row)
  };
  const script = loadScript({
    sheet,
    console: { log() {}, warn() {}, error: (value) => errors.push(value) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    Gmail: { Users: { Messages: { modify() { modifyCalls += 1; if (modifyCalls > 1) throw new Error("label failed"); } } } }
  });
  script.call("getErrorLogSheet_=function(){return sheet;}");
  script.call("addNeedsReviewLabelSafely_('one',{byName:{'AI/Needs Review':{id:'review'}}},new Error('original'))");
  script.call("addNeedsReviewLabelSafely_('two',{byName:{'AI/Needs Review':{id:'review'}}},new Error('original'))");
  script.call("logErrorSafely_('message',{code:'safe_code',message:'safe message',httpStatus:500,requestId:'req',clientRequestId:'client',attempt:2})");
  assert.equal(rows.length, 1);
  assert.equal(rows[0][2], "safe_code");
  assert.match(errors[0], /Unable to apply/);
  script.call("getErrorLogSheet_=function(){throw new Error('sheet failed');}");
  script.call("logErrorSafely_('',null)");
  assert.match(errors[1], /Sheets logging also failed/);
});

test("configuration validation covers category, service, key, and retention invariants", () => {
  const mutations = [
    ["", /Advanced Gmail/],
    ["CONFIG.MAX_MESSAGES_PER_RUN=0", /MAX_MESSAGES_PER_RUN/],
    ["CONFIG.CONFIDENCE_THRESHOLD=2", /CONFIDENCE_THRESHOLD/],
    ["CONFIG.CATEGORIES[0].id='Bad ID'", /category id/],
    ["CONFIG.CATEGORIES[0].label='Invoice'", /managed label/],
    ["CONFIG.CATEGORIES[1].id=CONFIG.CATEGORIES[0].id", /unique/],
    ["CONFIG.CATEGORIES=CONFIG.CATEGORIES.filter(function(x){return x.id!=='other';})", /Exactly one/]
  ];
  for (const [mutation, expected] of mutations) {
    const withGmail = mutation !== "";
    const script = loadScript({
      ...(withGmail ? { Gmail: { Users: {} } } : {}),
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) }
    });
    if (mutation) script.call(mutation);
    assert.throws(() => script.call("validateConfig_(false)"), expected);
  }
  const retention = loadScript({ PropertiesService: { getScriptProperties: () => ({ getProperty: () => "invalid" }) } });
  assert.throws(() => retention.call("getErrorLogRetentionDays_()"), /integer/);
  const key = loadScript({ PropertiesService: { getScriptProperties: () => ({ getProperty: () => " " }) } });
  assert.throws(() => key.call("getOpenAIKey_()"), /Missing/);
});

test("small data helpers cover absent values and case-insensitive headers", () => {
  const script = loadScript({
    Gmail: { Users: { Messages: { list: () => ({}) } } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => key === "OPENAI_MODEL" ? " custom-model " : null }) }
  });
  assert.deepEqual(Array.from(script.call("listPendingMessages_()")), []);
  assert.equal(script.call("buildEmailInput_({}).senderDomain"), "unknown");
  assert.equal(script.call("getConfiguredModel_()"), "custom-model");
  assert.equal(script.call("getHeaderCaseInsensitive_({'X-Request-ID':['first','second']},'x-request-id')"), "first");
  assert.equal(script.call("getHeaderCaseInsensitive_(null,'missing')"), "");
  assert.equal(script.call("parseJsonSafely_('bad')"), null);
  assert.equal(script.call("getErrorCode_(null)"), "runtime_error");
  assert.equal(script.call("safeErrorMessage_(null)"), "Unknown error");
  assert.equal(script.call("escapeSpreadsheetText_(null)"), "");
  assert.equal(script.call("hasLabelId_({},'missing')"), false);
});
