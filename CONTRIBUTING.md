# Como contribuir a NovaGest

Guia para el equipo de desarrollo (Ernesto, Brandom, Frank). Resume como trabajamos para que todo cambio sea revisado y quede registrado.

## Por que trabajamos asi
`main` y `develop` estan protegidas: no se sube nada directo. Todo cambio entra por un pull request (PR) que otra persona revisa y aprueba. Esto evita errores, ordena el trabajo y deja evidencia de quien cambio que y quien lo reviso (control de gestion de cambios de la auditoria).

## Antes de empezar
1. Tener instalados Java 21 y Git, y Docker Desktop encendido.
2. Clonar el repositorio:
   ```
   git clone https://github.com/ernestosantizo2003/NovaGest.git
   ```
3. Copiar `.env.example` a `.env` y completar los valores (el archivo `.env` nunca se sube).
4. Comprobar que todo compila y las pruebas pasan:
   ```
   .\mvnw.cmd clean verify
   ```

## Flujo para cada tarjeta
1. Tomar la tarjeta en el tablero de Notion y pasarla a **En curso**.
2. Crear la rama desde `develop` actualizado:
   ```
   git checkout develop
   git pull
   git checkout -b feature/02-paquetes
   ```
   Nombre de la rama: `feature/NN-descripcion` para funcionalidad o `fix/NN-descripcion` para correcciones, con el numero de la tarjeta.
3. Programar y hacer commits cortos, en imperativo y con el numero de tarjeta:
   ```
   git commit -m "02 Crear paquetes por modulo"
   ```
4. Subir la rama:
   ```
   git push -u origin feature/02-paquetes
   ```
5. En GitHub, abrir un **Pull Request hacia `develop`** y completar la lista de la plantilla.
6. Avisar al revisor. Cuando apruebe y se resuelvan sus comentarios, hacer el merge y pasar la tarjeta a **Hecho**.

## Quien revisa a quien
| Autor del PR | Revisa |
| --- | --- |
| Ernesto | Brandom |
| Brandom | Frank |
| Frank | Ernesto |

Nadie aprueba su propio PR. Quien revisa responde en menos de un dia habil.

## Una tarjeta esta hecha cuando
- [ ] El codigo compila y el pipeline pasa.
- [ ] Tiene pruebas del caso feliz y de al menos un caso de permiso denegado.
- [ ] El endpoint aparece en Swagger con su permiso documentado.
- [ ] Si toca el esquema, incluye su migracion de Flyway (revisada por DBA).
- [ ] La accion queda registrada en la bitacora si crea, edita o elimina.
- [ ] Otra persona reviso y aprobo el PR.

## Reglas del codigo
- El controlador solo recibe, valida y responde; la logica va en el servicio.
- Las entidades JPA nunca salen por la API: se responden DTO.
- Las transacciones se abren en el servicio con `@Transactional`.
- Los errores salen con un formato unico (Problem Details) desde un `@RestControllerAdvice`.
- `spring.jpa.hibernate.ddl-auto=validate`: el esquema cambia solo con migraciones de Flyway.
- Los permisos se validan en la API, nunca solo en el frontend.
- Ningun token ni contrasena en logs, en URLs ni en el codigo. Los secretos entran por variables de entorno.

## Prohibido
- `git push` directo a `main` o `develop` (GitHub lo rechaza).
- `git push --force` sobre ramas compartidas.
- Subir `.env`, claves, contrasenas o datos personales reales.

## Si algo sale mal
- Conflicto al hacer pull: avisar en el grupo antes de resolverlo a ciegas.
- Subiste un secreto por error: avisar de inmediato; hay que cambiar esa clave, no basta con borrar el commit.
- Duda sobre el alcance o una regla: preguntar a Ernesto antes de programar.

## Migraciones de Flyway (evitar versiones repetidas)
Cada migracion tiene una version unica: `V<numero>__descripcion.sql`. Si dos personas crean una migracion en ramas distintas, las dos eligen el siguiente numero y, al juntarlas, la aplicacion no arranca ("Found more than one migration with version N").
- Antes de crear una migracion, mira cual es la ultima version que hay en `develop` (`git fetch` y revisar `src/main/resources/db/migration`).
- Si al actualizar tu rama aparece un choque, **renumera la tuya** a la siguiente libre; no cambies la de la otra persona.
- La prueba `MigracionesTests` falla de inmediato si hay una version repetida, sin necesitar Docker.
- Nunca se edita una migracion que ya se mezclo en `develop`: se agrega una nueva.

### Migraciones compatibles hacia atras (expandir y despues contraer)
Con dos instancias sobre la misma base (ver `docs/dos-instancias.md`), la instancia de Ubuntu migra primero y la de Windows sigue unos minutos con el codigo anterior. Ese codigo viejo tiene que seguir funcionando con el esquema nuevo. Por eso un cambio de esquema se hace en **dos despliegues**:
1. **Expandir** (este despliegue): agregar tablas, o columnas `NULL` o con `DEFAULT`, o indices. El codigo nuevo ya las usa; el viejo las ignora.
2. **Contraer** (un despliegue posterior, cuando las dos instancias ya corren el codigo nuevo): borrar lo que ya no se usa, volver `NOT NULL` una columna que ya se llena, renombrar.
- **No** renombrar ni borrar columnas o tablas, ni agregar `NOT NULL` sin `DEFAULT`, ni cambiar el tipo de una columna, en el mismo despliegue en que el codigo deja de usarlas.
- Si el cambio no se puede hacer en dos pasos, avisar al DBA y a despliegue antes de mezclar: habra que parar la instancia vieja durante la actualizacion.
- Hibernate valida el esquema al arrancar (`ddl-auto=validate`): una columna que el codigo viejo espera y ya no existe impide que esa instancia arranque.
