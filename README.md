# mcp-contract

Project site: https://vystartasv.github.io/mcp-contract/

`mcp-contract` is a dependency-free, local-first CLI that validates MCP-like tool manifests and JSON-RPC fixture transcripts without starting a server or sending network traffic.

It is a contract checker, not an MCP implementation.

## Hypothesis and evidence

Hypothesis: as MCP tool catalogs proliferate, developers need a fast pre-connection check that catches malformed tool schemas, duplicate names, invalid JSON-RPC envelopes, and fixture request/response mismatches offline.

Evidence is intentionally classified:

- **Measured/documented:** authenticated GitHub searches on 2026-09-23 returned these public ecosystem popularity/activity signals: `punkpeye/awesome-mcp-servers` 95,439 stars, `microsoft/playwright-mcp` 37,483, `github/github-mcp-server` 33,131, `PrefectHQ/fastmcp` 27,870, and `googleapis/mcp-toolbox` 16,477.
- **Reported:** a recent HN Algolia result titled “MCP server that reduces Claude Code context consumption by 98%” showed 570 points. This is discussion activity, not product demand proof.
- **Inferred:** a bounded offline contract check may be useful before connecting an agent because the inputs are static files and the failures are reviewable.
- **Untestable here:** adoption, retention, willingness to pay, production failure reduction, and whether a team prefers this workflow to its existing CI checks.

The numbers above are signals, not customer or adoption claims.

## Why this wedge

Locally tested incumbents such as `jq` and JSON Schema validators validate individual JSON documents against expressions or schemas. They do not, in one bounded command, provide this product's focused MCP tool-list contract check, JSON-RPC transcript request/response matching, deterministic tool diff, and readable bounded failure report. That is only a local capability comparison; it is not a benchmark or claim that those tools cannot be composed.

Example local outputs:

```text
$ printf '%s' '{"tools":[]}' | jq -e '.tools | type == "array"'
true
$ bun run src/cli.ts check fixtures/valid-transcript.jsonl
OK valid-transcript.jsonl
```

`jq` proves the selected JSON expression for one document. `mcp-contract` checks the documented cross-event contract and correlation rules.

## Quickstart

Requires Bun 1.3+.

```sh
git clone https://github.com/vystartasv/mcp-contract.git
cd mcp-contract
bun install --frozen-lockfile
bun run build
./dist/mcp-contract check fixtures/valid-manifest.json
./dist/mcp-contract check fixtures/valid-transcript.jsonl
```

Expected successful checks print `OK ...`. A failure prints stable `CODE path: message` diagnostics and exits with code `2`.

## Commands

```text
mcp-contract check manifest.json
mcp-contract check transcript.jsonl
mcp-contract diff manifest-a.json manifest-b.json
mcp-contract report manifest.json --out report.html
mcp-contract demo
```

`check` infers transcript mode from the `.jsonl` extension; other files are manifest mode. `report` emits escaped HTML to stdout unless `--out` is supplied. `demo` is deterministic and needs no API key.

Exit codes are stable: `0` valid/success, `2` contract invalid, `3` usage or file error, `4` reserved for internal failures.

## Supported contract

The accepted manifest is exactly an object with a `tools` array. Each tool is exactly the focused subset `{name, description, inputSchema}`:

- `name` is non-empty and matches `^[A-Za-z][A-Za-z0-9._-]{0,127}$`.
- `description` is a non-empty string.
- `inputSchema` is a bounded schema subset. Supported types are `object`, `string`, `number`, `integer`, `boolean`, `array`, and `null`. Object schemas can use `properties`, `required`, and boolean `additionalProperties`; array schemas require `items`. `description` and primitive `enum` values are accepted.
- Unknown fields, unsupported schema keywords/types, duplicate tool names, missing fields, bad required names, and malformed JSON fail.

A transcript is JSONL with one JSON-RPC 2.0 request or response per non-empty line. This subset accepts only `tools/list` requests and responses with a non-empty string or safe integer `id`. Requests may have object `params`; responses contain exactly one `result` (the manifest-shaped tools/list result) or `error` (`code`, `message`, optional `data`). Every request needs exactly one matching response; duplicate requests/responses and mismatched or missing IDs fail.

Bounds are part of the contract: input <= 1 MiB, event <= 256 KiB, tool name <= 128 bytes, descriptions <= 4 KiB, schema/error fields <= 16 KiB, at most 1,000 tools, 256 object properties, 64 enum values, and schema depth <= 12. Diagnostics are capped at 100 and sorted deterministically.

`diff` reports sorted `+ added`, `- removed`, and `~ changed` tool names. It does not attempt semantic JSON Schema equivalence.

## Explicit non-goals

- No MCP server, transport, network request, URL following, or tool execution.
- No agent framework, hosted service, telemetry backend, security gateway, or generic JSON Schema implementation.
- No claim to validate every MCP version, transport, capability, pagination behavior, or vendor extension.

## Security posture

Inputs are parsed as data only. The CLI never executes tools, follows URLs, or sends requests. Input, event, field, schema depth, collection, and diagnostic bounds are enforced. Generated reports HTML-escape file names and diagnostic text.

## Verification transcript

The authoritative test command compiles every `tests/*.test.ts` file and executes every compiled JavaScript test file:

```text
$ bun run typecheck
$ bun run test
PASS manifest validation branches
PASS transcript matching branches
PASS deterministic diff and escaped report
PASS CLI exit codes and demo
PASS 4 compiled test files
$ bun run build
$ ./dist/mcp-contract demo
mcp-contract demo
OK demo manifest
OK demo transcript
```

The test suite covers valid and invalid manifests, every validation family, transcript matching, duplicate/missing IDs, deterministic diff, HTML escaping, bounds, and CLI exit codes. Fixtures are under `fixtures/`.

## Limitations, unknowns, and dropped items

Unknowns include real-world vendor extension frequency, schema features needed beyond this subset, and whether transcript fixtures should model notifications or pagination. Dropped from this wedge are notifications, batch JSON-RPC, `$ref`, combinators such as `anyOf`, pagination cursors, transports, and server execution. These are deliberate contract boundaries, not silently supported behavior.

Reopen trigger: collect at least three independent real fixture sets that fail only because of the same omitted contract feature, with a reproducible offline example and a clear safety/bounds rule. Reassess that feature then; do not broaden the checker from an unverified request.

## Development

```sh
bun run check
```

This runs typechecking, the authoritative compiled-test runner, and the Bun standalone build. License: MIT.
