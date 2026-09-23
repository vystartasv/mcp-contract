import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import {
  EXIT_CODES, checkManifestText, checkTranscriptText, demoManifest, diffManifests, htmlReport, stableJson,
  type CheckResult,
} from "./core";

function usage(): void {
  console.error("Usage: mcp-contract check <manifest.json|transcript.jsonl> | diff <a.json> <b.json> | report <input> [--out report.html] | demo");
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function print(result: CheckResult, label: string): void {
  if (result.ok) {
    console.log(`OK ${label}`);
    return;
  }
  console.error(`FAIL ${label}`);
  for (const diagnostic of result.diagnostics) console.error(`${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`);
}

function checkFile(path: string): CheckResult {
  const text = read(path);
  return extname(path).toLowerCase() === ".jsonl" ? checkTranscriptText(text) : checkManifestText(text);
}

function runDemo(): number {
  const manifest = demoManifest();
  const manifestText = JSON.stringify(manifest);
  const transcriptText = [
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    JSON.stringify({ jsonrpc: "2.0", id: 1, result: manifest }),
  ].join("\n");
  console.log("mcp-contract demo");
  print(checkManifestText(manifestText), "demo manifest");
  print(checkTranscriptText(transcriptText), "demo transcript");
  console.log(`manifest bytes: ${new TextEncoder().encode(manifestText).byteLength}`);
  console.log(`tools: ${(manifest.tools as unknown[]).length}`);
  console.log(`canonical: ${stableJson(manifest)}`);
  return EXIT_CODES.ok;
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    const [command, ...rest] = args;
    if (command === "demo" && rest.length === 0) return runDemo();
    if (command === "check" && rest.length === 1) {
      const path = rest[0];
      const result = checkFile(path);
      print(result, basename(path));
      return result.ok ? EXIT_CODES.ok : EXIT_CODES.invalid;
    }
    if (command === "diff" && rest.length === 2) {
      const [leftPath, rightPath] = rest;
      const left = checkManifestText(read(leftPath));
      const right = checkManifestText(read(rightPath));
      if (!left.ok || !right.ok) {
        print(left, basename(leftPath));
        print(right, basename(rightPath));
        return EXIT_CODES.invalid;
      }
      const changes = diffManifests(left.value as Record<string, unknown>, right.value as Record<string, unknown>);
      for (const line of changes) console.log(line);
      if (changes.length === 0) console.log("No tool changes.");
      return EXIT_CODES.ok;
    }
    if (command === "report" && (rest.length === 1 || rest.length === 3) && (rest.length === 1 || rest[1] === "--out")) {
      const inputPath = rest[0];
      const result = checkFile(inputPath);
      const html = htmlReport(basename(inputPath), result);
      if (rest.length === 3) writeFileSync(rest[2], html, "utf8");
      else process.stdout.write(html);
      return result.ok ? EXIT_CODES.ok : EXIT_CODES.invalid;
    }
    usage();
    return EXIT_CODES.usage;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return EXIT_CODES.usage;
  }
}

if (import.meta.main) process.exit(await main());
