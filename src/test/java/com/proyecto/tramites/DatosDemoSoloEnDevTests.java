package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** Tarjeta 24: fuera del perfil dev no existen los usuarios de demostracion ni corre su migracion. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles("test")
class DatosDemoSoloEnDevTests {

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void sinPerfilDevNoSeCarganLosDatosDemo() {
		assertThat(jdbc.queryForObject("SELECT count(*) FROM usuario WHERE correo LIKE '%@novagest.test'",
				Integer.class)).isZero();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE script = 'R__datos_demo.sql'",
				Integer.class)).isZero();
	}

}
