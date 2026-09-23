import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const sourceDir = join(root, "tests");
const outputDir = join(root, ".tmp", "compiled-tests");
const sources = readdirSync(sourceDir).filter((name) => name.endsWith(".test.ts")).sort();
if (sources.length === 0) throw new Error("no test files found");
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
for (const source of sources) {
  const build = Bun.spawnSync([process.execPath, "build", join("tests", source), "--outdir", outputDir, "--target", "bun"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (build.exitCode !== 0) {
    process.stdout.write(build.stdout);
    process.stderr.write(build.stderr);
    process.exit(build.exitCode || 1);
  }
}
const compiled = readdirSync(outputDir).filter((name) => name.endsWith(".js")).sort();
if (compiled.length !== sources.length) throw new Error("not every test file compiled");
for (const file of compiled) {
  const run = Bun.spawnSync([process.execPath, join(outputDir, file)], { cwd: root, stdout: "pipe", stderr: "pipe" });
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  if (run.exitCode !== 0) process.exit(run.exitCode || 1);
}
console.log(`PASS ${compiled.length} compiled test files`);
