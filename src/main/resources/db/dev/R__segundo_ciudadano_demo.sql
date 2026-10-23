-- Tarjeta 24: segunda cuenta ciudadana para demostrar aislamiento entre usuarios.
-- Solo se carga en dev, despues de R__datos_demo.sql (pgcrypto y roles ya existen).
-- Idempotente: conserva los usuarios y sus claves existentes.
INSERT INTO usuario (correo, nombre, hash_contrasena, activo)
SELECT 'ciudadano2@novagest.test', 'Segundo Ciudadano Demo',
       crypt('${demo_password}', gen_salt('bf', 10)), TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM usuario
    WHERE lower(correo) = 'ciudadano2@novagest.test' AND eliminado_en IS NULL
);

INSERT INTO usuario_rol (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuario u
JOIN rol r ON r.nombre = 'CIUDADANO'
WHERE lower(u.correo) = 'ciudadano2@novagest.test' AND u.eliminado_en IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM usuario_rol ur WHERE ur.usuario_id = u.id AND ur.rol_id = r.id
  );
