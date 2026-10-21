package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tarjeta 26: cabeceras de seguridad HTTP en todas las respuestas (correctas y de error), una politica distinta
 * para la documentacion Swagger y HSTS solo por HTTPS.
 */
class CabecerasSeguridadTests {

	private static final String CLAVE = "clave-segura-123";

	@Nested
	@Import(TestcontainersConfiguration.class)
	@SpringBootTest
	@AutoConfigureMockMvc
	@ActiveProfiles("test")
	@Transactional
	class ConLaConfiguracionPorDefecto {

		@Autowired
		private MockMvc mvc;

		private MockHttpServletResponse pedir(String ruta, boolean https) throws Exception {
			var peticion = get(ruta);
			if (https) {
				peticion = peticion.secure(true);
			}
			return mvc.perform(peticion).andReturn().getResponse();
		}

		private void exigirCabecerasBase(MockHttpServletResponse respuesta) {
			assertThat(respuesta.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
			assertThat(respuesta.getHeader("X-Frame-Options")).isEqualTo("DENY");
			assertThat(respuesta.getHeader("Referrer-Policy")).isEqualTo("no-referrer");
			assertThat(respuesta.getHeader("Permissions-Policy")).contains("camera=()").contains("microphone=()")
					.contains("geolocation=()");
			assertThat(respuesta.getHeader("Cache-Control")).contains("no-store");
		}

		@Test
		void unaRespuestaCorrectaLlevaTodasLasCabeceras() throws Exception {
			MockHttpServletResponse respuesta = pedir("/actuator/health", false);

			assertThat(respuesta.getStatus()).isEqualTo(200);
			exigirCabecerasBase(respuesta);
		}

		@Test
		void tambienLasRespuestasDeErrorDeSeguridad401() throws Exception {
			MockHttpServletResponse respuesta = pedir("/api/tramites", false);

			assertThat(respuesta.getStatus()).isEqualTo(401);
			exigirCabecerasBase(respuesta);
			assertThat(respuesta.getHeader("Content-Security-Policy")).isEqualTo(CabecerasSeguridadProbadas.CSP_API);
		}

		@Test
		void unaRutaQueNoExisteTambienLasLleva() throws Exception {
			MockHttpServletResponse respuesta = pedir("/ruta/que/no/existe", false);

			exigirCabecerasBase(respuesta);
		}

		@Test
		void unaRespuestaAutenticadaConDatosPersonalesNoSeGuardaEnCache() throws Exception {
			mvc.perform(post("/api/auth/registro").contentType(MediaType.APPLICATION_JSON)
					.content("{\"nombre\":\"Ana Lopez\",\"correo\":\"ana@demo.com\",\"clave\":\"" + CLAVE + "\"}"));
			String cuerpo = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
					.content("{\"correo\":\"ana@demo.com\",\"clave\":\"" + CLAVE + "\"}")).andReturn().getResponse()
					.getContentAsString();
			String token = JsonPath.read(cuerpo, "$.accessToken");

			MockHttpServletResponse respuesta = mvc
					.perform(get("/api/usuarios/yo").header("Authorization", "Bearer " + token)).andReturn()
					.getResponse();

			assertThat(respuesta.getStatus()).isEqualTo(200);
			exigirCabecerasBase(respuesta);
			assertThat(respuesta.getHeader("Cache-Control")).contains("no-cache").contains("must-revalidate");
			assertThat(respuesta.getHeader("Pragma")).isEqualTo("no-cache");
		}

		@Test
		void laApiNoCargaNadaDeNingunOrigenNiPuedeSerIncrustada() throws Exception {
			String csp = pedir("/actuator/health", false).getHeader("Content-Security-Policy");

			assertThat(csp).isEqualTo(CabecerasSeguridadProbadas.CSP_API);
			assertThat(csp).contains("default-src 'none'").contains("frame-ancestors 'none'")
					.contains("base-uri 'none'").contains("form-action 'none'");
			assertThat(csp).doesNotContain("unsafe-inline").doesNotContain("unsafe-eval").doesNotContain("*");
		}

		@ParameterizedTest
		@ValueSource(strings = { "/v3/api-docs", "/swagger-ui/index.html", "/swagger-ui.html" })
		void laDocumentacionTieneSuPropiaPoliticaLimitadaASiMisma(String ruta) throws Exception {
			String csp = pedir(ruta, false).getHeader("Content-Security-Policy");

			assertThat(csp).isEqualTo(CabecerasSeguridadProbadas.CSP_DOCUMENTACION);
			assertThat(csp).contains("default-src 'self'").contains("frame-ancestors 'none'");
			assertThat(csp).doesNotContain("unsafe-eval").doesNotContain("http:").doesNotContain("https:")
					.doesNotContain("*");
		}

		@Test
		void laPoliticaDeLaApiNoSeAplicaALaDocumentacionNiViceversa() throws Exception {
			assertThat(pedir("/v3/api-docs", false).getHeaders("Content-Security-Policy")).hasSize(1);
			assertThat(pedir("/actuator/health", false).getHeaders("Content-Security-Policy")).hasSize(1);
		}

		@Test
		void hstsSoloSeEnviaPorHttpsYSinIncluirSubdominios() throws Exception {
			assertThat(pedir("/actuator/health", false).getHeader("Strict-Transport-Security")).isNull();

			String hsts = pedir("/actuator/health", true).getHeader("Strict-Transport-Security");

			assertThat(hsts).isEqualTo("max-age=31536000");
			assertThat(hsts).doesNotContain("includeSubDomains").doesNotContain("preload");
		}

		@Test
		void hstsTambienVieneEnLasRespuestasDeErrorPorHttps() throws Exception {
			MockHttpServletResponse respuesta = pedir("/api/tramites", true);

			assertThat(respuesta.getStatus()).isEqualTo(401);
			assertThat(respuesta.getHeader("Strict-Transport-Security")).isEqualTo("max-age=31536000");
		}

	}

	@Nested
	@Import(TestcontainersConfiguration.class)
	@SpringBootTest(properties = "app.seguridad.hsts-segundos=0")
	@AutoConfigureMockMvc
	@ActiveProfiles("test")
	class ConHstsApagado {

		@Autowired
		private MockMvc mvc;

		@Test
		void conCeroSegundosNoSeEnviaNiPorHttps() throws Exception {
			MockHttpServletResponse respuesta = mvc.perform(get("/actuator/health").secure(true)).andReturn()
					.getResponse();

			assertThat(respuesta.getHeader("Strict-Transport-Security")).isNull();
			// El resto de las cabeceras sigue igual
			assertThat(respuesta.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
		}

	}

	@Nested
	@Import(TestcontainersConfiguration.class)
	@SpringBootTest(properties = "app.seguridad.hsts-segundos=600")
	@AutoConfigureMockMvc
	@ActiveProfiles("test")
	class ConOtroValorDeHsts {

		@Autowired
		private MockMvc mvc;

		@Test
		void respetaLosSegundosConfigurados() throws Exception {
			MockHttpServletResponse respuesta = mvc.perform(get("/actuator/health").secure(true)).andReturn()
					.getResponse();

			assertThat(respuesta.getHeader("Strict-Transport-Security")).isEqualTo("max-age=600");
		}

	}

	/** Los valores esperados se escriben aqui, no se importan de la clase probada, para que la prueba los vigile. */
	static final class CabecerasSeguridadProbadas {

		static final String CSP_API = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

		static final String CSP_DOCUMENTACION = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
				+ "base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

		private CabecerasSeguridadProbadas() {
		}

	}

}
