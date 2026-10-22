# Propuesta V11: coherencia del ciclo de pago

**Borrador para revisión. No se ha creado V11 en db/migration ni ejecutado este SQL.** V9/V10 permanecen idénticas. Cualquier adopción requiere decidir las reglas, comprobar de nuevo los datos, respaldo y autorización.

La auditoría del 21/10 encontró cero filas de pago. El servicio siempre resuelve con validador y fecha y exige comentario no vacío al rechazar; los CHECK de V9 no representan toda esa regla.

## Núcleo candidato

```sql
-- Solo dentro de una futura migración aprobada, tras revisar filas existentes.
ALTER TABLE tramites.pago
  ADD CONSTRAINT ck_pago_resolucion_coherente CHECK (
    (estado = 'PENDIENTE' AND validado_por IS NULL AND validado_en IS NULL)
    OR (estado IN ('VALIDADO','RECHAZADO')
        AND validado_por IS NOT NULL AND validado_en IS NOT NULL)
  );
ALTER TABLE tramites.pago
  ADD CONSTRAINT ck_pago_rechazo_comentado CHECK (
    estado <> 'RECHAZADO'
    OR (comentario IS NOT NULL AND btrim(comentario) <> '')
  );
```

Se mantiene ck_pago_segregacion y los dos índices únicos parciales existentes. No se impone comentario a VALIDADO, porque Java permite validarlo sin él. No se inventan fechas o motivos para adaptar filas.

## Decisiones adicionales, no incluidas por defecto

- MIME permitido (PDF/PNG/JPEG), SHA-256 hexadecimal de 64 caracteres y tamaño entre 1 y 5242880: añadir CHECK solo si se quiere fijar en SQL la política actual de ComprobanteAlmacen. Cambiar esa política exigiría actualizar también el contrato de base.
- La identidad de ciudadano debe corresponder al titular del trámite. PagoService lo deriva correctamente; si se exige esa coherencia en SQL, diseñar clave compuesta o mecanismo equivalente y revisar nulabilidad/mutabilidad del titular. No añadir un CHECK que consulte otra tabla. No exigir creado_por=ciudadano_id, pues un gestor autorizado puede registrar un pago ajeno.
- Fecha de validación y actualizado_en: definir primero política de relojes y escrituras SQL externas. No añadir desigualdades temporales sin acordarlas.
- Serializar dos resoluciones del mismo pago: resolver mediante bloqueo/versionado en un PR de aplicación; un CHECK por sí solo no resuelve la concurrencia.

## V10

No se propone cambio estructural obligatorio: tipos, índice y UNIQUE corresponden al contrato de cotizaciones. La inserción idempotente y validación de filas Banguat pertenecen a un PR de aplicación. Si se decide restringir moneda a un catálogo SQL o persistir la convención explícitamente, se requiere un diseño de V11 o versión posterior separado del endurecimiento de pagos.

## Validación previa al cierre de la futura migración

Ejecutar pruebas aisladas con casos PENDIENTE sin validador/fecha, resolución con ambos, rechazo vacío/nulo y no vacío, segregación y concurrencia. Volver a consultar filas existentes justo antes de aplicar; cero filas en esta auditoría no garantiza que siga vacío después. Planificar lock_timeout y recuperación en transacción. No editar migraciones ya aplicadas ni borrar filas para hacer pasar validaciones.
