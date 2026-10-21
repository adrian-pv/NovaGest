package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import com.proyecto.tramites.comun.config.LimiteProperties;
import com.proyecto.tramites.comun.config.LimiteProperties.Regla;
import com.proyecto.tramites.usuarios.repository.UsuarioRepository;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tarjeta 27: limite de peticiones por direccion IP en login, registro y refresh. Los limites de estas pruebas son
 * pequenos (3, 2 y 2) para no tener que repetir cientos de peticiones; los valores reales se prueban aparte.
 */
class LimitePeticionesTests {

	private static final String CLAVE = "clave-segura-123";

	private static final AtomicInteger CONTADOR_DE_DIRECCIONES = new AtomicInteger();

	/** Una direccion distinta en cada llamada: el limitador es de toda la aplicacion y las pruebas no deben mezclarse. */
	private static String direccionNueva() {
		int n = CONTADOR_DE_DIRECCIONES.incrementAndGet();
		return "10.20." + (n / 250) + "." + (n % 250 + 1);
	}

	private static MockHttpServletRequestBuilder desde(MockHttpServletRequestBuilder peticion, String direccion) {
		return peticion.with(solicitud -> {
			solicitud.setRemoteAddr(direccion);
			return solicitud;
		});
	}

	@Nested
	@Import(TestcontainersConfiguration.class)
	@SpringBootTest(properties = { "app.limite.habilitado=true", "app.limite.login.max=3",
			"app.limite.login.ventana=1m", "app.limite.registro.max=2", "app.limite.registro.ventana=1h",
			"app.limite.refresh.max=2", "app.limite.refresh.ventana=1m" })
	@AutoConfigureMockMvc
	@ActiveProfiles("test")
	@Transactional
	class Activo {

		@Autowired
		private MockMvc mvc;

		@Autowired
		private UsuarioRepository usuarios;

		private MockHttpServletResponse login(String correo, String clave, String direccion) throws Exception {
			return mvc.perform(desde(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
					.content("{\"correo\":\"" + correo + "\",\"clave\":\"" + clave + "\"}"), direccion)).andReturn()
					.getResponse();
		}

		private MockHttpServletResponse registrar(String correo, String direccion) throws Exception {
			return mvc.perform(desde(post("/api/auth/registro").contentType(MediaType.APPLICATION_JSON)
					.content("{\"nombre\":\"Ana Lopez\",\"correo\":\"" + correo + "\",\"clave\":\"" + CLAVE + "\"}"),
					direccion)).andReturn().getResponse();
		}

		private MockHttpServletResponse renovar(String direccion) throws Exception {
			return mvc.perform(desde(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
					.content("{\"refreshToken\":\"inventado\"}"), direccion)).andReturn().getResponse();
		}

		private void exigirQueRechaza(MockHttpServletResponse respuesta) {
			assertThat(respuesta.getStatus()).isEqualTo(429);
		}

		@Test
		void laPeticionSiguienteAlMaximoDeLoginRecibe429() throws Exception {
			String ip = direccionNueva();

			for (int i = 0; i < 3; i++) {
				assertThat(login("nadie@demo.com", "clave-mala-123", ip).getStatus()).isEqualTo(401);
			}

			exigirQueRechaza(login("nadie@demo.com", "clave-mala-123", ip));
		}

		@Test
		void el429EsProblemDetailsConRetryAfterYSinDatosInternos() throws Exception {
			String ip = direccionNueva();
			for (int i = 0; i < 3; i++) {
				login("nadie@demo.com", "clave-mala-123", ip);
			}

			MockHttpServletResponse respuesta = login("nadie@demo.com", "clave-mala-123", ip);

			assertThat(respuesta.getStatus()).isEqualTo(429);
			assertThat(respuesta.getContentType()).startsWith("application/problem+json");
			String cuerpo = respuesta.getContentAsString();
			assertThat(JsonPath.<Integer>read(cuerpo, "$.status")).isEqualTo(429);
			assertThat(JsonPath.<String>read(cuerpo, "$.title")).isEqualTo("Demasiados intentos");
			assertThat(JsonPath.<String>read(cuerpo, "$.detail")).contains("Intenta de nuevo en");
			long espera = Long.parseLong(respuesta.getHeader("Retry-After"));
			assertThat(espera).isBetween(1L, 60L);
			assertThat(cuerpo).doesNotContain(ip).doesNotContain("nadie@demo.com");
		}

		@Test
		void elRechazoLlevaLasCabecerasDeSeguridad() throws Exception {
			String ip = direccionNueva();
			for (int i = 0; i < 3; i++) {
				login("nadie@demo.com", "clave-mala-123", ip);
			}

			MockHttpServletResponse respuesta = login("nadie@demo.com", "clave-mala-123", ip);

			assertThat(respuesta.getStatus()).isEqualTo(429);
			assertThat(respuesta.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
			assertThat(respuesta.getHeader("Content-Security-Policy")).contains("default-src 'none'");
			assertThat(respuesta.getHeader("Cache-Control")).contains("no-store");
		}

		@Test
		void otraDireccionNoSeVeAfectada() throws Exception {
			String agotada = direccionNueva();
			for (int i = 0; i < 4; i++) {
				login("nadie@demo.com", "clave-mala-123", agotada);
			}

			assertThat(login("nadie@demo.com", "clave-mala-123", agotada).getStatus()).isEqualTo(429);
			assertThat(login("nadie@demo.com", "clave-mala-123", direccionNueva()).getStatus()).isEqualTo(401);
		}

		@Test
		void cadaOperacionTieneSuPropioContador() throws Exception {
			String ip = direccionNueva();
			for (int i = 0; i < 4; i++) {
				login("nadie@demo.com", "clave-mala-123", ip);
			}

			assertThat(login("nadie@demo.com", "clave-mala-123", ip).getStatus()).isEqualTo(429);
			assertThat(registrar("uno@demo.com", ip).getStatus()).isEqualTo(201);
			assertThat(renovar(ip).getStatus()).isEqualTo(401);
		}

		@Test
		void elRegistroTieneSuPropioLimite() throws Exception {
			String ip = direccionNueva();

			assertThat(registrar("r1@demo.com", ip).getStatus()).isEqualTo(201);
			assertThat(registrar("r2@demo.com", ip).getStatus()).isEqualTo(201);

			MockHttpServletResponse tercera = registrar("r3@demo.com", ip);
			assertThat(tercera.getStatus()).isEqualTo(429);
			// El registro dura una hora: la espera es mucho mayor que la del login
			assertThat(Long.parseLong(tercera.getHeader("Retry-After"))).isGreaterThan(60L).isLessThanOrEqualTo(3600L);
		}

		@Test
		void elRegistroRechazadoNoCreaLaCuenta() throws Exception {
			String ip = direccionNueva();
			registrar("r1@demo.com", ip);
			registrar("r2@demo.com", ip);

			registrar("bloqueada@demo.com", ip);

			assertThat(usuarios.findByCorreoIgnoreCaseAndEliminadoEnIsNull("bloqueada@demo.com")).isEmpty();
		}

		@Test
		void laRenovacionDeTokensTieneSuPropioLimite() throws Exception {
			String ip = direccionNueva();

			assertThat(renovar(ip).getStatus()).isEqualTo(401);
			assertThat(renovar(ip).getStatus()).isEqualTo(401);

			exigirQueRechaza(renovar(ip));
		}

		@Test
		void tambienCuentanLosInicioDeSesionCorrectos() throws Exception {
			String ip = direccionNueva();
			registrar("ana@demo.com", direccionNueva());
			for (int i = 0; i < 3; i++) {
				assertThat(login("ana@demo.com", CLAVE, ip).getStatus()).isEqualTo(200);
			}

			exigirQueRechaza(login("ana@demo.com", CLAVE, ip));
		}

		@Test
		void unaPeticionRechazadaNoSumaFallosAUnaCuentaNiLlegaALaAutenticacion() throws Exception {
			registrar("ana@demo.com", direccionNueva());
			String ip = direccionNueva();
			for (int i = 0; i < 3; i++) {
				login("ana@demo.com", "clave-mala-123", ip);
			}
			int fallosAntes = usuarios.findByCorreoIgnoreCaseAndEliminadoEnIsNull("ana@demo.com").orElseThrow()
					.getIntentosFallidos();

			exigirQueRechaza(login("ana@demo.com", "clave-mala-123", ip));
			exigirQueRechaza(login("ana@demo.com", CLAVE, ip));

			assertThat(fallosAntes).isEqualTo(3);
			assertThat(usuarios.findByCorreoIgnoreCaseAndEliminadoEnIsNull("ana@demo.com").orElseThrow()
					.getIntentosFallidos()).isEqualTo(3);
		}

		@Test
		void noSePuedeSaltarElLimiteInventandoLaCabeceraXForwardedFor() throws Exception {
			String ip = direccionNueva();
			int estatus = 0;

			for (int i = 0; i < 4; i++) {
				estatus = mvc.perform(desde(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
						.header("X-Forwarded-For", "203.0.113." + i)
						.header("X-Real-IP", "198.51.100." + i)
						.content("{\"correo\":\"nadie@demo.com\",\"clave\":\"clave-mala-123\"}"), ip)).andReturn()
						.getResponse().getStatus();
			}

			assertThat(estatus).isEqualTo(429);
		}

		@Test
		void soloSeCuentanLosPostALasRutasLimitadas() throws Exception {
			String ip = direccionNueva();
			for (int i = 0; i < 8; i++) {
				// GET y OPTIONS al mismo camino no son intentos de iniciar sesion
				assertThat(mvc.perform(desde(get("/api/auth/login"), ip)).andReturn().getResponse().getStatus())
						.isNotEqualTo(429);
			}

			assertThat(login("nadie@demo.com", "clave-mala-123", ip).getStatus()).isEqualTo(401);
		}

		@Test
		void elRestoDeLaApiNoSeLimita() throws Exception {
			String ip = direccionNueva();
			for (int i = 0; i < 20; i++) {
				assertThat(mvc.perform(desde(get("/actuator/health"), ip)).andReturn().getResponse().getStatus())
						.isEqualTo(200);
			}
		}

		@Test
		void unaDireccionLimitadaSigueUsandoSuSesionYaIniciada() throws Exception {
			registrar("ana@demo.com", direccionNueva());
			String ip = direccionNueva();
			String cuerpo = login("ana@demo.com", CLAVE, ip).getContentAsString();
			String token = JsonPath.read(cuerpo, "$.accessToken");
			login("ana@demo.com", CLAVE, ip);
			login("ana@demo.com", CLAVE, ip);
			exigirQueRechaza(login("ana@demo.com", CLAVE, ip));

			MockHttpServletResponse perfil = mvc
					.perform(desde(get("/api/usuarios/yo").header("Authorization", "Bearer " + token), ip)).andReturn()
					.getResponse();

			assertThat(perfil.getStatus()).isEqualTo(200);
		}

	}

	@Nested
	@Import(TestcontainersConfiguration.class)
	@SpringBootTest
	@AutoConfigureMockMvc
	@ActiveProfiles("test")
	class ApagadoYValoresPorDefecto {

		@Autowired
		private MockMvc mvc;

		@Autowired
		private LimiteProperties propiedades;

		@Test
		void conElLimiteApagadoNuncaSeRechaza() throws Exception {
			String ip = direccionNueva();
			for (int i = 0; i < 60; i++) {
				assertThat(mvc.perform(desde(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
						.content("{\"correo\":\"nadie@demo.com\",\"clave\":\"clave-mala-123\"}"), ip)).andReturn()
						.getResponse().getStatus()).isEqualTo(401);
			}
		}

		@Test
		void losValoresPorDefectoSonLosDeLaDocumentacion() {
			assertThat(propiedades.login()).isEqualTo(new Regla(30, Duration.ofMinutes(1)));
			assertThat(propiedades.registro()).isEqualTo(new Regla(10, Duration.ofHours(1)));
			assertThat(propiedades.refresh()).isEqualTo(new Regla(60, Duration.ofMinutes(1)));
		}

	}

	@Test
	void unaReglaInvalidaImpideArrancar() {
		assertThatThrownBy(() -> new Regla(0, Duration.ofMinutes(1))).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("al menos 1");
		assertThatThrownBy(() -> new Regla(5, Duration.ZERO)).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("positiva");
		assertThatThrownBy(() -> new Regla(5, Duration.ofSeconds(-1))).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> new Regla(5, null)).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void faltarUnaReglaImpideArrancar() {
		Regla regla = new Regla(5, Duration.ofMinutes(1));

		assertThatThrownBy(() -> new LimiteProperties(true, regla, null, regla))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("Faltan reglas");
	}

}
