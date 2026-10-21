package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Tarjeta 46: la aplicacion completa con el perfil prod no publica la documentacion de la API ni carga datos de
 * demostracion. La base la levanta Testcontainers; la clave es de pruebas y aleatoria (no es un secreto real).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = { "app.jwt.secret=k8Qz3vLw9XpR2mTnYb6HcJd5FgUa7SeN4oVi1WxZ0qE=", // gitleaks:allow
		"app.pagos.directorio=target/comprobantes-prueba", "app.limite.habilitado=false",
		"app.divisas.tarea-diaria.habilitada=false" })
@AutoConfigureMockMvc
@ActiveProfiles("prod")
class PerfilProdSeguroTests {

	@Autowired
	private MockMvc mvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void laDocumentacionDeLaApiNoSePublica() throws Exception {
		for (String ruta : new String[] { "/v3/api-docs", "/swagger-ui.html", "/swagger-ui/index.html" }) {
			int estado = mvc.perform(get(ruta)).andReturn().getResponse().getStatus();
			assertThat(estado).as(ruta).isIn(401, 403, 404);
		}
	}

	@Test
	void noExistenLosUsuariosDeDemostracion() {
		assertThat(jdbc.queryForObject("SELECT count(*) FROM usuario WHERE correo LIKE '%@novagest.test'", Integer.class))
				.isZero();
	}

}
