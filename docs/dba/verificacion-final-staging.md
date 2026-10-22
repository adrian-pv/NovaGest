# Protocolo final — preparado, aún no ejecutado

<a id="informe-antesdespues"></a>

## Informe antes/después

Línea base: auditoría 22/10/2026 00:07:12 UTC y health 01:04:46 UTC. La columna posterior se completará con fecha/archivo/hash tras la ventana; **no se ejecutó todavía**. La auditoría acredita una instantánea.

| # | Criterio | Antes realmente acreditado | Después / aceptación |
| --- | --- | --- | --- |
| 1 | PostgreSQL accesible | Auditoría ejecutada; API actual UP. | Pendiente: conexión nueva correcta. |
| 2 | Base correcta | tramites_pruebas. | Pendiente: ambas autenticaciones en esa base. |
| 3 | App con clave nueva | Sin rotación realizada. | Pendiente: psql -W y pool nuevo. |
| 4 | Migrador con clave nueva | Sin rotación realizada. | Pendiente: psql -W independiente. |
| 5 | TLS nuevo | Diez sesiones app TLS 1.3 en auditoría. | Pendiente: ambos roles y pool nuevo; registrar versión. |
| 6 | Propietarios | 67 objetos y una función bajo owner. | Pendiente: comparar inventario y propiedad. |
| 7 | Historial inalterado | Nueve filas conservadas en reporte. | Pendiente: captura íntegra antes/después idéntica. |
| 8 | Migraciones exitosas | V1–V6, V8–V10, nueve success=t. | Pendiente: guardia confirma conjunto exacto. |
| 9 | Checksums | V9 -956879505, V10 -130265834. | Pendiente: mismos valores. |
| 10 | Mínimo privilegio | App con SELECT/INSERT/UPDATE/DELETE en historial. | Pendiente: sin privilegios ni SET ROLE owner; EXPLAIN denegados; migrador conservado. |
| 11 | Negocio accesible | CRUD de app, secuencias USAGE/SELECT; pago=0. | Pendiente: snapshots y lecturas como app. |
| 12 | API | UP a las 01:04:46 UTC. | Pendiente: UP tras recreación. |
| 13 | Errores de autenticación | Logs privilegiados no revisados en esta preparación. | Pendiente: cero errores nuevos tras ADRIAN_LISTO; separar intervalo de relevo. |
| 14 | Misma imagen | ID real de inicio aún por capturar en ventana. | Pendiente: igualdad exacta de .Image. |
| 15 | Misma red | Compose actual según evidencia/confirmación. | Pendiente: mismos NetworkID/configuración, captura de Adrián. |
| 16 | Volúmenes / datos | Sin DML/eliminación por nosotros; snapshot inicial pendiente. | Pendiente: mismos montajes e historial/conteos; conteos no prueban igualdad de cada fila. |
| 17 | SET ROLE | Confirmado por Adrián/usuario; owner e installed_by coherentes. | Pendiente: configuración única efectiva; migrador capaz y app sin asumir owner. |
| 18 | NavControl | Sin acciones sobre ese proyecto; sin prueba operativa independiente. | Pendiente: conformidad de su responsable antes/después, sin modificarlo. |
| 19 | Producción | Sin comandos/cambios en este cierre; no auditada. | Pendiente: confirmar alcance sin afirmar auditoría de producción. |

Inicio/fin, autorizaciones y participantes: pendientes. Paquete: SHA256SUMS vigente. Resultado final: **PENDIENTE**, sin aprobación definitiva.

Solo después de la corrección autorizada de ACL, ambas claves cambiadas, y ADRIAN_LISTO tras una recreación. No repetir ahora la auditoría ya completada como sustituto de esta comprobación posterior.

## Ejecución autorizada

Desde la copia verificada de root del [paquete de cierre](plan-cierre-staging.md):

```bash
# Sustituir por el ID sha256 real registrado ANTES de la ventana; no es una contraseña.
bash verificar-staging-final.sh --verificar sha256:ID_DE_64_HEXADECIMALES
```

El script exige ID completo válido y una TTY. No reinicia, no rota y no modifica ACL. Solo abre el candado existente para evitar solaparse con Adrián, consulta Docker/health y PostgreSQL de staging y solicita las claves nuevas sin eco para conexiones independientes.

## Criterios verificables

| Punto | Evidencia / condición de aceptación |
| --- | --- |
| Misma imagen | .Image coincide exactamente con el ID anterior a la ventana, no solo current_tag. Adrián aporta topología/volúmenes sin cambios. |
| API | health UP después de recreación. No sustituye pruebas de autenticación. |
| Credenciales nuevas | psql -W de migrador y app, sin pgpass/PGPASSWORD heredados, conexión nueva TLS a tramites_pruebas. La prueba local no demuestra por sí sola la ruta Docker. |
| Ruta Docker y pool | Sesiones activas de app desde el contenedor actual, iniciadas después de StartedAt de la recreación y con ssl=t. Registrar versión TLS; si cambia de TLS1.3, investigar antes de cerrar. |
| SET ROLE / configuración | Entorno del contenedor validado en memoria: Flyway=migrador, datasource=app, INIT_SQLS único SET ROLE tramites_owner y currentSchema=tramites. No imprime URL, claves ni docker inspect completo. |
| Propietarios | Auditoría específica: los 67 objetos y la función continúan bajo owner. Comparar inventario, no asumirlo por el nombre de usuario. |
| Historial | Nueve versiones esperadas, success=t, V9 -956879505 y V10 -130265834; guardia falla si cambian o vuelve el acceso de la app. |
| Mínimo privilegio | App sin permisos sobre historial; EXPLAIN sin ANALYZE de INSERT/UPDATE/DELETE rechazado con 42501. App mantiene lectura de pago/tipo_cambio y evidencia de permisos de negocio y secuencias idéntica. |
| Datos | Comparar estado-negocio-staging.sql contra captura de inicio: filas `permiso|` y `secuencia|` idénticas; historial idéntico. Las filas `conteo|` son evidencia: pueden cambiar por uso legítimo de staging durante la ventana y se explican, no bloquean. Conteos iguales no son un hash de cada fila. Guardar respaldo privado. No se ejecutó DML destructivo. |
| Errores de autenticación | Adrián/DBA revisan, en privado y desde el inicio de ventana, los FATAL de staging en el log PostgreSQL. Registrar solo fecha, rol y número de errores; nunca líneas de sentencias o valores. Separar errores durante el relevo de los posteriores a ADRIAN_LISTO: después deben ser cero. |
| NavControl | Nuestros comandos no reinician ni modifican sus servicios/configuración/base. El responsable confirma sus comprobaciones habituales antes/después; no inventar una verificación que no se haya hecho. |
| Otros entornos | Paquete restringido a staging, sin comandos sobre otros roles/bases/servicios. No afirmar una auditoría de producción que no se ejecutó. |

La prueba automatizada cubre imagen, health, configuración, conexiones, guardia y auditoría. La conciliación de datos, el examen acotado de logs y la conformidad operativa del responsable se adjuntan antes de emitir el dictamen. La guardia debe repetirse después de cualquier futuro despliegue/recreación o GRANT; no puede darse por integrada en el pipeline hasta que el equipo la incorpore y pruebe.

## Evidencias y cierre

Guardar reportes privados con fecha UTC, hash del paquete, versión/ID anterior y posterior, resultados de guardia, comparación de historial/conteos y conformidades. No publicar .env, copias, roles con verificadores de contraseña, llaves ni salida de inspección completa. En #87 solo resumen técnico sin secretos.

Si falla un criterio, mantener Deploy en pausa y estado CAMBIOS REQUERIDOS. No reparar Flyway, reejecutar migraciones, cambiar imagen o borrar datos para conseguir un resultado verde. Si todo pasa, preparar el dictamen favorable con las observaciones aceptadas y mostrarlo al usuario antes de registrarlo como APROBADO. Producción requiere su propio procedimiento y autorización.
