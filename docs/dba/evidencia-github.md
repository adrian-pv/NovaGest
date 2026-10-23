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

## Revalidación — 22/10/2026 01:04–01:10 UTC

Main y develop siguen con solo deletion/non_fast_forward. Ruleset 24593540 activo; current_user_can_bypass=never para hgfdiuy. La respuesta no incluyó bypass_actors: **no se certifica ausencia de excepciones para otros actores**; Ernesto debe revisar la lista administrativa. Sin reglas de PR/revisión/checks, un push directo ordinario no queda bloqueado por esas dos reglas, aunque no exista bypass. No se realizó ningún push a main/develop.

No aparece .github/CODEOWNERS en las dos ramas base al consultar. #88 asigna /src/main/resources/db/migration/ a hgfdiuy y /.github/CODEOWNERS a ernestosantizo2003. Los scripts docs/dba/scripts no tienen code owner específico; se solicita revisión expresa de Ernesto/DBA, sin ampliar asignaciones por nuestra cuenta.

Deploy 391215659 sigue disabled_manually; queued/in_progress/waiting/requested/pending: cero cada uno. Revalidar y confirmar operaciones manuales antes de ventana. Develop consultado: 3782c99de2cb0cbdc49f3729aef9f98c064d09f6; solo frontend/README cambió frente al código DBA auditado. Sin diferencias en src/main, pom.xml, deploy o .github. Simulaciones locales merge-tree de #85 y #88 contra ese develop: sin conflictos; no fusionan ramas ni cambian el árbol de trabajo. GitHub también reporta mergeable=true.

### PR #84: material útil

Abierto/borrador; cuatro archivos revisados completos. #88 conserva owner/SET ROLE/default privileges y separación de credenciales. La red externa y creación de redes en setup-server.sh se descartan para staging actual. **No se incorporaron** las variables SCHEMAS/DEFAULT_SCHEMA/INIT_SQLS al ejemplo app.env.example ni al instalador: mejora futura de plantillas para instalaciones nuevas, no requisito del runtime confirmado. Conservar ese pendiente sin ejecutar setup-server ni cambiar redes. Tampoco trasladar como hechos actuales las afirmaciones históricas de producción/firewall de #84. Comentario final listo localmente; cierre sin merge pendiente de autorización.

### PR #85: revisión para Ernesto

Abierto/listo, head 45a8d3426852395293fc8b49103f3d88e9b55b9b. Diff completo: cuatro líneas añadidas en pom.xml, incluidas jackson-bom.version=3.1.7 y jackson-2-bom.version=2.21.7; sin cambios de parent, Tomcat, Java, Flyway, workflows ni despliegue. Cuatro checks verdes. [CI principal 39690687365](https://github.com/ernestosantizo2003/NovaGest/actions/runs/39690687365): 625 pruebas, cero fallos/errores/omitidas, BUILD SUCCESS. Las 589 del cuerpo del PR son de una ejecución anterior del fork.

[Trivy job 119535834773](https://github.com/ernestosantizo2003/NovaGest/actions/runs/39690687393/job/119535834773): cero hallazgos en pom.xml, docs/ejemplo-jwt/pom.xml y frontend/package-lock.json; configuración HIGH/CRITICAL con parche disponible. No equivale a escanear jar/imagen completos; OSV y CVE específicas del cuerpo son evidencia aportada por el autor, sin nueva certificación independiente aquí. Antes de producción verificar dependencias resueltas/SBOM/imagen. La nota que exige #84 está obsoleta: staging funciona con Compose y Deploy está pausado. Sin conflictos detectados contra develop consultado; sin merge ni dependencias adicionales modificadas.

## Instrucciones exactas propuestas para Ernesto

Requieren administrador y autorización; no aplicadas. [Referencia oficial de reglas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).

1. Settings → Rules → Rulesets → proteger-main-y-develop (24593540): Active, destinos main/develop, conservar bloqueo de eliminación/force-push.
2. Require a pull request before merging; Required approvals=1 mínimo; Require review from Code Owners; Dismiss stale pull request approvals when new commits are pushed; Require conversation resolution before merging. No marcar Restrict updates indiscriminadamente: podría impedir el flujo normal.
3. Require status checks to pass: seleccionar contextos reales de GitHub Actions Compilar y probar; Buscar secretos en el historial; Dependencias vulnerables; Frontend - compilar y probar. Seleccionar integración de origen; no nombres aproximados ni Deploy mientras esté pausado. Si falta un contexto, esperar una ejecución válida y volver a seleccionar.
4. Exigir rama actualizada antes de merge si se adopta ese flujo; comprobar que los workflows corren en sus PR. No activar merge queue sin adaptar eventos/checks. No cambiamos CI aquí.
5. Revisar Bypass list administrativamente. Propuesta: sin bypass permanente de roles amplios/usuarios/apps; cualquier excepción de emergencia se decide, limita y audita explícitamente. Registrar actores y modos reales; never para hgfdiuy no describe a todo el equipo.
6. Integrar CODEOWNERS por PR autorizado en cada rama base donde deba regir. Si hgfdiuy autoría una migración, designar segundo DBA independiente: el autor no puede autoaprobarse. Un no-DBA en la misma línea permitiría que cualquiera satisfaga la regla.
7. Con PR de prueba acordado y sin fusionarlo, comprobar solicitud DBA y bloqueo sin aprobación/checks. No ensayar mediante push directo o merge real. Adjuntar configuración/reglas efectivas posteriores. Protección GitHub no autoriza despliegues de producción.
