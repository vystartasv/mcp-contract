# Contributing

Keep changes small and offline-first. Do not add network calls, tool execution, runtime dependencies, or a broader MCP implementation.

Before opening a change:

```sh
bun install --frozen-lockfile
bun run check
```

Add a fixture or standalone test when changing a contract rule. Keep diagnostics bounded, stable, and deterministic.
