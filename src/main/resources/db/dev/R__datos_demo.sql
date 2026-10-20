-- Tarjeta 24 · Datos iniciales para demostración (SOLO perfil dev).
-- Ubicación en el repo: src/main/resources/db/dev/R__datos_demo.sql
-- Migración repetible: Flyway la ejecuta después de todas las versionadas
-- y solo vuelve a correr si el archivo cambia. Es idempotente: nunca
-- sobrescribe un usuario o tipo de trámite que ya exista.
-- No consume número de versión (P2: un solo responsable numera las V<n>).
--
-- Verificado contra V2 (usuario, rol, usuario_rol) y V4 (tipo_tramite) de develop.
--
-- C-09: ninguna contraseña vive en el repositorio. La contraseña demo llega
-- por el placeholder ${demo_password} (variable de entorno DEMO_PASSWORD), entre
-- comillas simples: Flyway 12 no lo reemplaza dentro de $pw$...$pw$. Por eso la
-- clave demo no puede llevar comillas simples.
-- El hash BCrypt (prefijo $2a$, aceptado por BCryptPasswordEncoder de Spring)
-- se calcula en la base con pgcrypto.
-- Cambiar DEMO_PASSWORD después de la primera carga NO actualiza los hashes
-- existentes: en local usar `docker compose down -v`.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0) Falla con un mensaje claro si DEMO_PASSWORD viene vacía, es muy corta
--    o si Flyway no reemplazó el placeholder (quedaría el texto literal "$" + "{demo_password}").
DO $guard$
BEGIN
    IF length('${demo_password}') < 8 THEN
        RAISE EXCEPTION 'DEMO_PASSWORD debe tener al menos 8 caracteres (revisar .env)';
    END IF;
    IF position(chr(36) || chr(123) IN '${demo_password}') = 1 THEN
        RAISE EXCEPTION 'Flyway no reemplazo el placeholder demo_password (revisar application-dev.properties)';
    END IF;
END
$guard$;

-- 1) Un usuario de ejemplo por rol (datos ficticios)
INSERT INTO usuario (correo, nombre, hash_contrasena, activo)
SELECT v.correo, v.nombre, crypt('${demo_password}', gen_salt('bf', 10)), TRUE
FROM (VALUES
        ('ciudadano@novagest.test',     'Ciudadano Demo'),
        ('gestor@novagest.test',        'Gestor Demo'),
        ('auditor@novagest.test',       'Auditor Demo'),
        ('administrador@novagest.test', 'Administrador Demo')
     ) AS v(correo, nombre)
WHERE NOT EXISTS (
    SELECT 1 FROM usuario u
    WHERE lower(u.correo) = lower(v.correo) AND u.eliminado_en IS NULL
);

-- 2) Asignar el rol correspondiente a cada usuario de ejemplo
INSERT INTO usuario_rol (usuario_id, rol_id)
SELECT u.id, r.id
FROM (VALUES
        ('ciudadano@novagest.test',     'CIUDADANO'),
        ('gestor@novagest.test',        'GESTOR'),
        ('auditor@novagest.test',       'AUDITOR'),
        ('administrador@novagest.test', 'ADMINISTRADOR')
     ) AS m(correo, rol)
JOIN usuario u ON lower(u.correo) = lower(m.correo) AND u.eliminado_en IS NULL
JOIN rol     r ON r.nombre = m.rol
WHERE NOT EXISTS (
    SELECT 1 FROM usuario_rol ur WHERE ur.usuario_id = u.id AND ur.rol_id = r.id
);

-- 3) Tercer tipo de trámite de la demo (Boleto de ornato y Pago de IGSS ya los crea V4)
INSERT INTO tipo_tramite (nombre, descripcion, monto, activo)
SELECT v.nombre, v.descripcion, v.monto, TRUE
FROM (VALUES
        ('Constancia de residencia', 'Constancia de residencia (demo)', 25.00::numeric)
     ) AS v(nombre, descripcion, monto)
WHERE NOT EXISTS (
    SELECT 1 FROM tipo_tramite t
    WHERE lower(t.nombre) = lower(v.nombre) AND t.eliminado_en IS NULL
);
