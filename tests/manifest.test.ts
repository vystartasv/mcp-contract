import assert from "node:assert/strict";
import { checkManifestText, LIMITS } from "../src/core";

const valid = { tools: [{ name: "echo", description: "Echo text", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } }] };
const codes = (text: string) => checkManifestText(text).diagnostics.map((item) => item.code);

assert.equal(checkManifestText(JSON.stringify(valid)).ok, true);
assert.ok(codes("{").includes("MALFORMED_JSON"));
assert.ok(codes(JSON.stringify({ tools: [{ name: "echo", description: "x", inputSchema: { type: "object" } }, { name: "echo", description: "x", inputSchema: { type: "object" } }] })).includes("DUPLICATE_TOOL_NAME"));
assert.ok(codes(JSON.stringify({ tools: [{ name: "bad name", description: "x", inputSchema: { type: "object" } }] })).includes("INVALID_TOOL_NAME"));
assert.ok(codes(JSON.stringify({ tools: [{ name: "x", inputSchema: { type: "object" } }] })).includes("MISSING_FIELD"));
assert.ok(codes(JSON.stringify({ tools: [{ name: "x", description: "x", inputSchema: { type: "date" } }] })).includes("UNSUPPORTED_SCHEMA_TYPE"));
assert.ok(codes(JSON.stringify({ nope: true, tools: [] })).includes("UNKNOWN_FIELD"));
assert.ok(codes(JSON.stringify({ tools: [{ name: "x", description: "x", inputSchema: { type: "array" } }] })).includes("MISSING_SCHEMA_VALUE"));
assert.ok(codes(JSON.stringify({ tools: [{ name: "x", description: "x", inputSchema: { type: "object", properties: { a: { type: "string" } }, required: ["b"] } }] })).includes("UNKNOWN_REQUIRED_NAME"));
assert.ok(codes(JSON.stringify("x")).includes("INVALID_ROOT"));
assert.ok(codes(JSON.stringify({ tools: Array.from({ length: LIMITS.maxTools + 1 }, (_, i) => ({ name: `x${i}`, description: "x", inputSchema: { type: "object" } })) })).includes("TOO_MANY_TOOLS"));
assert.ok(codes("x".repeat(LIMITS.maxInputBytes + 1)).includes("INPUT_TOO_LARGE"));
console.log("PASS manifest validation branches");
