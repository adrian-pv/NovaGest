package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Segunda instancia (por ejemplo Windows) con SPRING_FLYWAY_ENABLED=false: la base ya la migro la otra instancia. La
 * aplicacion debe arrancar, validar el esquema (ddl-auto=validate) y atender consultas sin tocar Flyway.
 */
@SpringBootTest(properties = "spring.flyway.enabled=false")
@ActiveProfiles("test")
class InstanciaSinFlywayTests {

	private static final PostgreSQLContainer BASE = new PostgreSQLContainer(DockerImageName.parse("postgres:latest"));

	@DynamicPropertySource
	static void baseYaMigradaPorLaOtraInstancia(DynamicPropertyRegistry propiedades) {
		BASE.start();
		Flyway.configure().dataSource(BASE.getJdbcUrl(), BASE.getUsername(), BASE.getPassword())
				.locations("classpath:db/migration").load().migrate();
		propiedades.add("spring.datasource.url", BASE::getJdbcUrl);
		propiedades.add("spring.datasource.username", BASE::getUsername);
		propiedades.add("spring.datasource.password", BASE::getPassword);
	}

	@Autowired
	private ApplicationContext contexto;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void arrancaValidandoElEsquemaSinEjecutarFlyway() {
		assertThat(contexto.getBeanNamesForType(Flyway.class)).isEmpty();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM rol", Integer.class)).isPositive();
	}

}
