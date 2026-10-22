# Evidencia de acceso y revisión obligatoria

Consultado el 21/10/2026, entre 23:50 y 23:59 UTC, en `ernestosantizo2003/NovaGest`. Respuestas completas conservadas en `NovaGest-Infra/docs/evidencias/` (local).

| Consulta REST de solo lectura | Resultado relevante |
| --- | --- |
| `GET /repos/ernestosantizo2003/NovaGest/collaborators/hgfdiuy/permission` | `permission=write`, `push=true`, `admin=false`, `maintain=false`. |
| `GET /repos/ernestosantizo2003/NovaGest/rulesets` | Ruleset 24593540, `proteger-main-y-develop`, activo. |
| `GET /repos/ernestosantizo2003/NovaGest/rulesets/24593540` | Include: `refs/heads/main`, `refs/heads/develop`; reglas: `deletion`, `non_fast_forward`. |
| `GET /repos/ernestosantizo2003/NovaGest/rules/branches/develop` | Solo `deletion`, `non_fast_forward`. |
| `GET /repos/ernestosantizo2003/NovaGest/rules/branches/main` | Solo `deletion`, `non_fast_forward`. |
| `GET /repos/ernestosantizo2003/NovaGest/branches/{main,develop}/protection` | Ambas devolvieron HTTP 404. Las reglas efectivas anteriores permiten evaluar la cobertura sin depender únicamente de este 404. |
| `GET /repos/ernestosantizo2003/NovaGest/actions/workflows` | Deploy (`391215659`) `disabled_manually`; CI, Frontend, Seguridad y Comando remoto activos. |
| `gh pr checks 85 --repo ernestosantizo2003/NovaGest` | Compilar y probar, buscar secretos, dependencias vulnerables y frontend: pass. |
| `git ls-tree -r --name-only origin/{main,develop} -- '*CODEOWNERS*'` | Sin resultados antes de este PR. |

Conclusión: el acceso permite proponer CODEOWNERS; todavía no existe una exigencia automática de revisión DBA. Activarla requiere intervención del administrador y que CODEOWNERS llegue a las ramas base correspondientes.

No se alteraron reglas, entornos, workflows, ejecuciones ni protecciones mediante estas consultas.
