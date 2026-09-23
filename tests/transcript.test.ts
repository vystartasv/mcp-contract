import assert from "node:assert/strict";
import { checkTranscriptText, LIMITS } from "../src/core";

const manifest = { tools: [{ name: "echo", description: "Echo", inputSchema: { type: "object" } }] };
const request = JSON.stringify({ jsonrpc: "2.0", id: "r1", method: "tools/list", params: {} });
const response = JSON.stringify({ jsonrpc: "2.0", id: "r1", result: manifest });
const codes = (text: string) => checkTranscriptText(text).diagnostics.map((item) => item.code);

assert.equal(checkTranscriptText(`${request}\n${response}\n`).ok, true);
assert.ok(codes(`${request}\n${response}\n${response}`).includes("DUPLICATE_RESPONSE_ID"));
assert.ok(codes(request).includes("MISSING_RESPONSE"));
assert.ok(codes(JSON.stringify({ jsonrpc: "2.0", id: 3, result: manifest })).includes("MISMATCH_RESPONSE_ID"));
assert.ok(codes(JSON.stringify({ jsonrpc: "2.0", id: null, method: "tools/list" })).includes("INVALID_ID"));
assert.ok(codes(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", extra: true })).includes("UNKNOWN_FIELD"));
assert.ok(codes(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "other" })).includes("INVALID_METHOD"));
assert.ok(codes(`${request}\n{`).includes("MALFORMED_JSON"));
assert.ok(codes(`${request}\n${JSON.stringify({ jsonrpc: "2.0", id: "r1", error: { code: -1, message: "no" } })}`).length === 0);
assert.ok(codes(`${request}\n${"x".repeat(LIMITS.maxEventBytes + 1)}`).includes("EVENT_TOO_LARGE"));
console.log("PASS transcript matching branches");
