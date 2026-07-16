import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const cases = JSON.parse(await readFile(new URL("evals/classification-cases.json", root), "utf8"));
validateCases(cases);
if (process.argv.includes("--validate")) {
  console.log(`Evaluation dataset checks passed (${cases.length} cases, including prompt injection).`);
  process.exit(0);
}
const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is required for the paid evaluation run.");
const model = process.env.OPENAI_MODEL || "gpt-4o-mini-2024-07-18";
const source = await readFile(new URL("src/Code.gs", root), "utf8");
const context = vm.createContext({ console });
vm.runInContext(source, context, { filename: "src/Code.gs" });
const predictions = [];
for (const item of cases) {
  context.emailInput = { subject: item.subject, senderDomain: item.senderDomain, bodySnippet: item.bodySnippet };
  context.model = model;
  const payload = vm.runInContext("buildOpenAIPayload_(emailInput, model)", context);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`OpenAI evaluation request failed with HTTP ${response.status}.`);
  context.responseText = await response.text();
  const classification = vm.runInContext("parseOpenAIResponse_(responseText)", context);
  const predicted = classification.confidence < 0.65 ? "other" : classification.categoryId;
  predictions.push({ id: item.id, expected: item.expected, predicted, confidence: classification.confidence });
}
const labels = [...new Set(cases.map((item) => item.expected))].sort();
const metrics = Object.fromEntries(labels.map((label) => [label, categoryMetrics(label, predictions)]));
const correct = predictions.filter((item) => item.expected === item.predicted).length;
console.log(JSON.stringify({ model, evaluated_at: new Date().toISOString(), accuracy: correct / predictions.length,
  prompt_injection_passed: cases.filter((item) => item.injection).every((item) => predictions.find((result) => result.id === item.id)?.predicted === item.expected),
  metrics, predictions }, null, 2));

function categoryMetrics(label, values) {
  const tp = values.filter((item) => item.expected === label && item.predicted === label).length;
  const fp = values.filter((item) => item.expected !== label && item.predicted === label).length;
  const fn = values.filter((item) => item.expected === label && item.predicted !== label).length;
  return { precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, true_positive: tp, false_positive: fp, false_negative: fn };
}
function validateCases(value) {
  assert.ok(Array.isArray(value) && value.length >= 14, "at least 14 evaluation cases are required");
  const allowed = new Set(["invoice", "order", "complaint", "quote_request", "marketing", "internal", "other"]);
  const ids = new Set();
  for (const item of value) {
    assert.ok(item.id && !ids.has(item.id), `duplicate or missing id: ${item.id}`); ids.add(item.id);
    assert.ok(allowed.has(item.expected), `unknown expected category: ${item.expected}`);
    for (const field of ["subject", "senderDomain", "bodySnippet"]) assert.equal(typeof item[field], "string");
    assert.ok(item.senderDomain.endsWith(".example"), "evaluation sender domains must be fictional .example domains");
  }
  for (const label of allowed) assert.ok(value.some((item) => item.expected === label), `missing category: ${label}`);
  assert.ok(value.filter((item) => item.injection).length >= 2, "at least two prompt-injection cases are required");
}
