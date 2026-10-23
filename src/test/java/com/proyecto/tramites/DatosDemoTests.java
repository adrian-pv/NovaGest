package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Tarjeta 24: con dev se cargan cinco usuarios (dos ciudadanos) y el tercer tipo de tramite.
 * Se activa dev sobre test para probar tambien la configuracion real (ubicacion db/dev y placeholder).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "DEMO_PASSWORD=" + DatosDemoTests.CLAVE_DEMO)
@AutoConfigureMockMvc
@ActiveProfiles({ "test", "dev" })
class DatosDemoTests {

	static final String CLAVE_DEMO = "clave-demo-para-pruebas";

	@Autowired
	private MockMvc mvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private Flyway flyway;

	private MvcResult login(String correo, String clave) throws Exception {
		String cuerpo = "{\"correo\":\"" + correo + "\",\"clave\":\"" + clave + "\"}";
		return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(cuerpo))
				.andReturn();
	}

	@ParameterizedTest
	@CsvSource({
			"ciudadano@novagest.test, CIUDADANO",
			"ciudadano2@novagest.test, CIUDADANO",
			"gestor@novagest.test, GESTOR",
			"auditor@novagest.test, AUDITOR",
			"administrador@novagest.test, ADMINISTRADOR" })
	void cadaUsuarioDemoIniciaSesionConLaClaveDelEntornoYTieneSoloSuRol(String correo, String rol) throws Exception {
		MvcResult resultado = login(correo, CLAVE_DEMO);

		assertThat(resultado.getResponse().getStatus()).isEqualTo(200);
		assertThat(JsonPath.<String>read(resultado.getResponse().getContentAsString(), "$.accessToken")).isNotBlank();
		assertThat(jdbc.queryForList("""
				SELECT r.nombre FROM usuario u
				JOIN usuario_rol ur ON ur.usuario_id = u.id
				JOIN rol r ON r.id = ur.rol_id
				WHERE u.correo = ?""", String.class, correo)).containsExactly(rol);
	}

	@Test
	void ningunaClaveDemoQuedaEnTextoPlano() {
		assertThat(jdbc.queryForList("SELECT hash_contrasena FROM usuario WHERE correo LIKE '%@novagest.test'",
				String.class)).hasSize(5).allSatisfy(hash -> assertThat(hash).startsWith("$2a$").doesNotContain(CLAVE_DEMO));
	}

	@Test
	void segundoCiudadanoNoPuedeConsultarTramitesDelPrimero() throws Exception {
		String tokenPrimero = JsonPath.read(login("ciudadano@novagest.test", CLAVE_DEMO)
				.getResponse().getContentAsString(), "$.accessToken");
		String tokenSegundo = JsonPath.read(login("ciudadano2@novagest.test", CLAVE_DEMO)
				.getResponse().getContentAsString(), "$.accessToken");
		Long tipoId = jdbc.queryForObject("SELECT id FROM tipo_tramite WHERE nombre = 'Boleto de ornato'", Long.class);
		MvcResult creado = mvc.perform(post("/api/tramites")
				.header("Authorization", "Bearer " + tokenPrimero)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"tipoId\":" + tipoId + ",\"datos\":{}}"))
				.andReturn();
		assertThat(creado.getResponse().getStatus()).isEqualTo(201);
		Number id = JsonPath.read(creado.getResponse().getContentAsString(), "$.id");
		assertThat(mvc.perform(get("/api/tramites/" + id)
				.header("Authorization", "Bearer " + tokenSegundo))
				.andReturn().getResponse().getStatus()).isEqualTo(404);
	}

	@Test
	void existenLosTresTiposDeTramiteDeLaDemo() {
		assertThat(jdbc.queryForObject(
				"SELECT count(*) FROM tipo_tramite WHERE lower(nombre) = 'constancia de residencia' AND eliminado_en IS NULL",
				Integer.class)).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM tipo_tramite WHERE eliminado_en IS NULL", Integer.class))
				.isGreaterThanOrEqualTo(3);
	}

	@Test
	void volverACorrerLaCargaNoDuplicaDatos() {
		jdbc.update("DELETE FROM flyway_schema_history WHERE script IN ('R__datos_demo.sql', 'R__segundo_ciudadano_demo.sql')");
		flyway.migrate();

		assertThat(jdbc.queryForObject("SELECT count(*) FROM usuario WHERE correo LIKE '%@novagest.test'",
				Integer.class)).isEqualTo(5);
		assertThat(jdbc.queryForObject(
				"SELECT count(*) FROM tipo_tramite WHERE lower(nombre) = 'constancia de residencia'", Integer.class))
				.isEqualTo(1);
	}

}
