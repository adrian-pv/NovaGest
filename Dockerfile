# Etapa 1: compila el jar con el wrapper de Maven
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN chmod +x mvnw && ./mvnw -q dependency:go-offline
COPY src src
RUN ./mvnw -q -DskipTests package

# Etapa 2: imagen de ejecucion solo con el JRE y un usuario sin privilegios
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system novagest && useradd --system --gid novagest novagest
# /usr/bin/pebble (gestor de servicios de la imagen base) no se usa: la app arranca con java -jar. Su Go stdlib trae 4 CVE HIGH
# (hallazgo de Raul); se quita en vez de esperar una base nueva. Revisar si la base ya trae un pebble parchado.
RUN rm -f /usr/bin/pebble
COPY --from=build /app/target/*.jar app.jar
RUN mkdir -p /data/comprobantes && chown novagest:novagest /data/comprobantes
ENV COMPROBANTES_DIR=/data/comprobantes
USER novagest
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
