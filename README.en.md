# dsh-plugin-changelog-gen — Changelog Gen

Genera CHANGELOG Markdown desde commits git, agrupando por tipo convencional (feat/fix/docs/etc.) y opcionalmente guardando el archivo.

## Tools

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `generate` | Generar changelog |
| `save` | Guardar changelog |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-changelog-gen` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-changelog-gen
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_CHANGELOG_GEN_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\changelog-gen\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
