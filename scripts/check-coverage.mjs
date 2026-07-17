import { readFile, rm } from "node:fs/promises";

const path = new URL("../coverage/coverage-final.json", import.meta.url);
const data = JSON.parse(await readFile(path, "utf8"));
const files = Object.values(data);
if (files.length !== 1) throw new Error(`Expected one instrumented source file, found ${files.length}.`);

const file = files[0];
const lineCounts = new Map();
for (const [id, count] of Object.entries(file.s)) {
  const line = file.statementMap[id].start.line;
  lineCounts.set(line, Math.max(lineCounts.get(line) || 0, count));
}

const metrics = {
  statements: summarize(Object.values(file.s)),
  branches: summarize(Object.values(file.b).flat()),
  functions: summarize(Object.values(file.f)),
  lines: summarize([...lineCounts.values()])
};
const thresholds = { statements: 90, branches: 85, functions: 90, lines: 90 };

const failures = [];
for (const [name, result] of Object.entries(metrics)) {
  const percentage = result.total ? (result.covered / result.total) * 100 : 100;
  console.log(`${name}: ${result.covered}/${result.total} (${percentage.toFixed(2)}%)`);
  if (percentage + Number.EPSILON < thresholds[name]) {
    failures.push(`${name} coverage ${percentage.toFixed(2)}% is below ${thresholds[name]}%`);
  }
}

if (failures.length) throw new Error(failures.join("; "));

await rm(new URL("../coverage", import.meta.url), { recursive: true, force: true });
console.log("Coverage thresholds passed.");

function summarize(counts) {
  return { total: counts.length, covered: counts.filter((count) => count > 0).length };
}
