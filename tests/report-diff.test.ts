import assert from "node:assert/strict";
import { checkManifestText, diffManifests, escapeHtml, htmlReport } from "../src/core";

const left = { tools: [
  { name: "same", description: "same", inputSchema: { type: "object" } },
  { name: "gone", description: "gone", inputSchema: { type: "object" } },
] };
const right = { tools: [
  { name: "same", description: "changed", inputSchema: { type: "object" } },
  { name: "new", description: "new", inputSchema: { type: "object" } },
] };
assert.deepEqual(diffManifests(left, right), ["- gone", "+ new", "~ same"]);
assert.equal(escapeHtml(`<x a="b">&'`), "&lt;x a=&quot;b&quot;&gt;&amp;&#39;");
const report = htmlReport("<unsafe>.json", { ok: false, diagnostics: [{ path: "$.x", code: "BAD", message: "<script>" }] });
assert.ok(report.includes("&lt;unsafe&gt;.json"));
assert.ok(report.includes("&lt;script&gt;"));
assert.equal(checkManifestText(JSON.stringify(left)).ok, true);
console.log("PASS deterministic diff and escaped report");
