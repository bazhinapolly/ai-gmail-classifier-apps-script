import { readFile, readdir } from "node:fs/promises";
import { Script } from "node:vm";

const source = await readFile(new URL("../src/Code.gs", import.meta.url), "utf8");
new Script(source, { filename: "src/Code.gs" });

const manifest = JSON.parse(
  await readFile(new URL("../src/appsscript.json", import.meta.url), "utf8")
);
const expectedScopes = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/script.external_request",
  "https://www.googleapis.com/auth/script.scriptapp",
  "https://www.googleapis.com/auth/script.storage",
  "https://www.googleapis.com/auth/spreadsheets"
];

if (manifest.runtimeVersion !== "V8") {
  throw new Error("Apps Script manifest must use the V8 runtime.");
}

if (JSON.stringify(manifest.oauthScopes) !== JSON.stringify(expectedScopes)) {
  throw new Error("Apps Script OAuth scopes differ from the reviewed allowlist.");
}

const advancedServices = manifest.dependencies?.enabledAdvancedServices || [];
if (
  !advancedServices.some(
    (service) =>
      service.userSymbol === "Gmail" &&
      service.serviceId === "gmail" &&
      service.version === "v1"
  )
) {
  throw new Error("Advanced Gmail API v1 must be enabled in the manifest.");
}

const rootEntries = await readdir(new URL("..", import.meta.url));
const forbidden = rootEntries.filter((name) => name === ".DS_Store");
if (forbidden.length) {
  throw new Error(`Local-only files must not be present: ${forbidden.join(", ")}`);
}

console.log("Static checks passed.");
