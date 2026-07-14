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
