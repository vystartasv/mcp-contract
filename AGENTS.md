# AGENTS.md

`mcp-contract` is a dependency-free runtime CLI for offline checks of the documented MCP-like contract.

- Keep the product separate from every other project under `/Users/vilius/Projects`.
- Runtime code belongs in `src/`; tests are standalone compiled Bun files under `tests/`.
- Run `bun run check` before changes are handed off. The authoritative test script compiles and executes every `tests/*.test.ts` file.
- Do not add an MCP server, network access, tool execution, agent framework, telemetry, gateway, or general JSON Schema implementation.
- Preserve bounded input handling, stable diagnostics, deterministic output, and the documented contract in README.md.
