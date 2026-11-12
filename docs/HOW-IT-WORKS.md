# How dsh-plugin-changelog-gen works

Genera CHANGELOG Markdown desde commits git, agrupando por tipo convencional (feat/fix/docs/etc.) y opcionalmente guardando el archivo.

## Architecture

```
DSH ──MCP stdio──► server.mjs (single-file bundle)
                    └─ local plugin logic
```

## Safety

- Read by default; actions require `confirm:true`.
- `read-only` mode via environment variable.
- Allowlists where applicable.
- Audit at `<DSH_HOME>\cache\changelog-gen\audit.jsonl`.
- Action rate limit.

## Validation

End-to-end tests with the official MCP client (`@modelcontextprotocol/client@2.2.0`)
and the packaged artifact (`npm pack` → `postinstall` → deployed server).
