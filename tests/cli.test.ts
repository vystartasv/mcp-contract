import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "mcp-contract-"));
const good = join(dir, "manifest.json");
const bad = join(dir, "bad.json");
writeFileSync(good, JSON.stringify({ tools: [{ name: "x", description: "x", inputSchema: { type: "object" } }] }));
writeFileSync(bad, "{");
const run = (args: string[]) => Bun.spawnSync([process.execPath, "src/cli.ts", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
assert.equal(run(["check", good]).exitCode, 0);
assert.equal(run(["check", bad]).exitCode, 2);
assert.equal(run(["check"]).exitCode, 3);
assert.equal(run(["demo"]).exitCode, 0);
rmSync(dir, { recursive: true, force: true });
console.log("PASS CLI exit codes and demo");
