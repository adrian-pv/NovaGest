package com.proyecto.tramites;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Una base PostgreSQL propia para la clase de pruebas que la importa (cada contexto de Spring arranca su contenedor y se
 * descarta con @DirtiesContext). Sirve a las pruebas que CONFIRMAN datos con varias transacciones reales: la bitacora y
 * el historial no se pueden borrar, asi que no se deben mezclar con la base que usan las pruebas transaccionales.
 */
@TestConfiguration(proxyBeanMethods = false)
class BaseAislada {

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresAislado() {
		return new PostgreSQLContainer(DockerImageName.parse("postgres:latest"));
	}

}
