package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;

import com.proyecto.tramites.comun.config.CorsConfig;
import com.proyecto.tramites.comun.config.CorsProperties;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.cors.CorsConfigurationSource;

/**
 * Tarjeta 25: CORS cerrado por defecto y abierto solo a los origenes configurados. Nunca con comodin.
 */
class CorsTests {

	private static final String PERMITIDO = "http://localhost:5173";
	private static final String AJENO = "https://sitio-ajeno.example";

	/** Con origenes configurados, solo ellos pasan. */
	@Nested
	@Import(TestcontainersConfiguration.class)
	@SpringBootTest(properties = "app.cors.origenes-permitidos=" + PERMITIDO + ",https://novagest.example")
	@AutoConfigureMockMvc
	@ActiveProfiles("test")
	class ConOrigenesConfigurados {

		@Autowired
		private MockMvc mvc;

		private MockHttpServletResponse preflight(String origen, String metodo, String ruta) throws Exception {
			return mvc.perform(options(ruta).header("Origin", origen).header("Access-Control-Request-Method", metodo)
					.header("Access-Control-Request-Headers", "authorization,content-type")).andReturn().getResponse();
		}

		@Test
		void elPreflightDelOrigenPermitidoSeResuelveSinToken() throws Exception {
			MockHttpServletResponse respuesta = preflight(PERMITIDO, "POST", "/api/tramites");

			assertThat(respuesta.getStatus()).isEqualTo(200);
			assertThat(respuesta.getHeader("Access-Control-Allow-Origin")).isEqualTo(PERMITIDO);
			assertThat(respuesta.getHeader("Access-Control-Allow-Methods")).contains("POST").contains("DELETE");
			assertThat(respuesta.getHeader("Access-Control-Allow-Headers").toLowerCase()).contains("authorization");
			assertThat(respuesta.getHeader("Access-Control-Allow-Credentials")).isNull();
		}

		@Test
		void elPreflightDeUnOrigenAjenoSeRechaza() throws Exception {
			MockHttpServletResponse respuesta = preflight(AJENO, "POST", "/api/tramites");

			assertThat(respuesta.getStatus()).isEqualTo(403);
			assertThat(respuesta.getHeader("Access-Control-Allow-Origin")).isNull();
		}

		@Test
		void unMetodoNoPermitidoSeRechazaAunqueElOrigenSeaValido() throws Exception {
			assertThat(preflight(PERMITIDO, "PATCH", "/api/tramites").getStatus()).isEqualTo(403);
		}

		@Test
		void lasRespuestasAUnOrigenAjenoNoLlevanCabecerasCors() throws Exception {
			MockHttpServletResponse respuesta = mvc.perform(get("/actuator/health").header("Origin", AJENO)).andReturn()
					.getResponse();

			assertThat(respuesta.getHeader("Access-Control-Allow-Origin")).isNull();
		}

		@Test
		void laRespuestaAlOrigenPermitidoExponeSoloLasCabecerasNecesarias() throws Exception {
			MockHttpServletResponse respuesta = mvc.perform(get("/actuator/health").header("Origin", PERMITIDO))
					.andReturn().getResponse();

			assertThat(respuesta.getHeader("Access-Control-Allow-Origin")).isEqualTo(PERMITIDO);
			assertThat(respuesta.getHeader("Access-Control-Expose-Headers")).contains("Content-Disposition")
					.contains("Retry-After");
		}

		@Test
		void unEndpointProtegidoSigueExigiendoTokenAunqueElOrigenSeaPermitido() throws Exception {
			assertThat(mvc.perform(get("/api/tramites").header("Origin", PERMITIDO)).andReturn().getResponse()
					.getStatus()).isEqualTo(401);
		}

	}

	/** Sin configuracion (valor por defecto) no se acepta ningun origen del navegador. */
	@Nested
	@Import(TestcontainersConfiguration.class)
	@SpringBootTest
	@AutoConfigureMockMvc
	@ActiveProfiles("test")
	class SinOrigenesConfigurados {

		@Autowired
		private MockMvc mvc;

		@Test
		void ningunOrigenPasaCuandoNoHayLista() throws Exception {
			MockHttpServletResponse respuesta = mvc.perform(options("/api/tramites").header("Origin", PERMITIDO)
					.header("Access-Control-Request-Method", "GET")).andReturn().getResponse();

			assertThat(respuesta.getStatus()).isEqualTo(403);
			assertThat(respuesta.getHeader("Access-Control-Allow-Origin")).isNull();
		}

	}

	/** El arranque falla si la lista trae un comodin u otro valor que no sea un origen exacto. */
	@ParameterizedTest
	@ValueSource(strings = { "*", "http://*", "https://*.example.com", "http://localhost:5173/", "localhost:5173",
			"http://localhost:5173/app", "ftp://localhost", "http://local host" })
	void unOrigenInvalidoImpideArrancar(String origen) {
		CorsConfig configuracion = new CorsConfig();

		assertThatThrownBy(() -> configuracion.corsConfigurationSource(new CorsProperties(List.of(origen))))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("CORS_ORIGINS");
	}

	@Test
	void losOrigenesExactosSonValidosYLosEspaciosSeIgnoran() {
		CorsConfigurationSource fuente = new CorsConfig()
				.corsConfigurationSource(new CorsProperties(List.of(" http://localhost:5173 ", "https://novagest.example", "")));

		assertThat(fuente).isNotNull();
		assertThat(new CorsProperties(List.of(" http://a:1 ", "")).origenesPermitidos()).containsExactly("http://a:1");
		assertThat(new CorsProperties(null).origenesPermitidos()).isEmpty();
	}

}
