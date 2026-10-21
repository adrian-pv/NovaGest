package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Tarjeta 45: la API detras de un proxy ve la direccion, el esquema y el host ORIGINALES de quien llama, pero solo
 * cuando la peticion llega desde un proxy de confianza; desde cualquier otro origen las cabeceras X-Forwarded-* se
 * ignoran. Se prueba con un servidor real (no con MockMvc, que no pasa por Tomcat) y con peticiones crudas, y se mira
 * lo que queda de verdad en la bitacora de auditoria.
 * <p>
 * El cliente de las pruebas se conecta desde 127.0.0.1, que hace el papel de "el proxy".
 */
class IpDelClienteTrasProxyTests {

	private static final String CLAVE = "clave-segura-123";

	private static final AtomicInteger CONTADOR = new AtomicInteger();

	/** Base comun: servidor real y utilidades para registrar y leer la IP guardada en la bitacora. */
	abstract static class Base {

		@Value("${local.server.port}")
		int puerto;

		@Autowired
		JdbcTemplate jdbc;

		PeticionCruda.Respuesta registrar(Map<String, String> cabeceras) throws IOException {
			String correo = "ana" + CONTADOR.incrementAndGet() + "@demo.com";
			return PeticionCruda.enviar(puerto, "POST", "/api/auth/registro", cabeceras,
					"{\"nombre\":\"Ana Lopez\",\"correo\":\"" + correo + "\",\"clave\":\"" + CLAVE + "\"}");
		}

		/** La IP que quedo en la bitacora al registrar un usuario con esas cabeceras. */
		String ipRegistrada(Map<String, String> cabeceras) throws IOException {
			PeticionCruda.Respuesta respuesta = registrar(cabeceras);
			assertThat(respuesta.estado()).as("el registro debe funcionar: %s", respuesta.cuerpo()).isEqualTo(201);
			long id = JsonPath.<Number>read(respuesta.cuerpo(), "$.id").longValue();
			return jdbc.queryForObject(
					"SELECT ip FROM bitacora WHERE accion = 'REGISTRO_USUARIO' AND recurso_id = ?", String.class, id);
		}

		PeticionCruda.Respuesta login(Map<String, String> cabeceras) throws IOException {
			return PeticionCruda.enviar(puerto, "POST", "/api/auth/login", cabeceras,
					"{\"correo\":\"nadie@demo.com\",\"clave\":\"clave-mala-123\"}");
		}

		static Map<String, String> cab(String... paresClaveValor) {
			Map<String, String> mapa = new LinkedHashMap<>();
			for (int i = 0; i < paresClaveValor.length; i += 2) {
				mapa.put(paresClaveValor[i], paresClaveValor[i + 1]);
			}
			return mapa;
		}

		/** Una direccion de cliente distinta cada vez, para que los contadores de un test no afecten a otro. */
		static String clienteNuevo() {
			int n = CONTADOR.incrementAndGet();
			return "203.0." + (n / 250) + "." + (n % 250 + 1);
		}

	}

	/** Lo normal en desarrollo y sin proxy: las cabeceras reenviadas se ignoran. */
	@Nested
	@Import(TestcontainersConfiguration.class)
	@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
	@ActiveProfiles("test")
	class SinProxyConfigurado extends Base {

		@Test
		void unaIpInventadaEnXForwardedForSeIgnora() throws Exception {
			String ip = ipRegistrada(cab("X-Forwarded-For", "203.0.113.9"));

			assertThat(ip).isEqualTo("127.0.0.1");
		}

		@Test
		void xForwardedProtoNoSeCreeAsiQueNoSeEnviaHsts() throws Exception {
			PeticionCruda.Respuesta respuesta = PeticionCruda.enviar(puerto, "GET", "/actuator/health",
					cab("X-Forwarded-Proto", "https"), null);

			assertThat(respuesta.estado()).isEqualTo(200);
			assertThat(respuesta.cabecera("Strict-Transport-Security")).isNull();
		}

	}

	/** Detras de Nginx: el proxy (127.0.0.1) es de confianza y la IP, el esquema y el host reales se respetan. */
	@Nested
	@Import(TestcontainersConfiguration.class)
	@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = {
			"server.forward-headers-strategy=native", "server.tomcat.remoteip.internal-proxies=127[.]0[.]0[.]1",
			"app.limite.habilitado=true", "app.limite.login.max=2", "app.limite.login.ventana=1m" })
	@ActiveProfiles("test")
	class ConProxyDeConfianza extends Base {

		@Test
		void laBitacoraGuardaLaIpRealDelCliente() throws Exception {
			String ip = ipRegistrada(cab("X-Forwarded-For", "198.51.100.23"));

			assertThat(ip).isEqualTo("198.51.100.23");
		}

		@Test
		void sinXForwardedForQuedaLaDireccionDeLaConexion() throws Exception {
			assertThat(ipRegistrada(cab())).isEqualTo("127.0.0.1");
		}

		@Test
		void unaIpInventadaPorElClienteNoGana_ValeLaQueAnadioElProxy() throws Exception {
			// Nginx anade la direccion que vio al final de la cadena; lo que el cliente puso antes no es de fiar
			String ip = ipRegistrada(cab("X-Forwarded-For", "6.6.6.6, 198.51.100.24"));

			assertThat(ip).isEqualTo("198.51.100.24");
		}

		@Test
		void conHttpsReenviadoSiSeEnviaHsts() throws Exception {
			PeticionCruda.Respuesta respuesta = PeticionCruda.enviar(puerto, "GET", "/actuator/health",
					cab("X-Forwarded-Proto", "https"), null);

			assertThat(respuesta.estado()).isEqualTo(200);
			assertThat(respuesta.cabecera("Strict-Transport-Security")).isEqualTo("max-age=31536000");
		}

		@Test
		void sinHttpsReenviadoNoSeEnviaHsts() throws Exception {
			PeticionCruda.Respuesta respuesta = PeticionCruda.enviar(puerto, "GET", "/actuator/health", cab(), null);

			assertThat(respuesta.cabecera("Strict-Transport-Security")).isNull();
		}

		@Test
		void elLimiteDePeticionesCuentaPorClienteRealYNoPorElProxy() throws Exception {
			String clienteA = clienteNuevo();
			String clienteB = clienteNuevo();

			assertThat(login(cab("X-Forwarded-For", clienteA)).estado()).isEqualTo(401);
			assertThat(login(cab("X-Forwarded-For", clienteA)).estado()).isEqualTo(401);
			PeticionCruda.Respuesta rechazada = login(cab("X-Forwarded-For", clienteA));

			assertThat(rechazada.estado()).isEqualTo(429);
			assertThat(rechazada.cabecera("Retry-After")).isNotNull();
			// Otro cliente detras del mismo proxy no se ve afectado
			assertThat(login(cab("X-Forwarded-For", clienteB)).estado()).isEqualTo(401);
		}

		@Test
		void inventarDireccionesNoSirveParaSaltarseElLimite() throws Exception {
			// El proxy siempre pone la direccion que vio al final: lo que el cliente antepone no cambia su cubeta
			String cliente = clienteNuevo();
			int ultimo = 0;

			for (int i = 0; i < 3; i++) {
				ultimo = login(cab("X-Forwarded-For", "9.9.9." + i + ", " + cliente)).estado();
			}

			assertThat(ultimo).isEqualTo(429);
		}

		@Test
		void unPostDelNavegadorDelMismoOrigenPublicoNoRecibe403PorCors() throws Exception {
			PeticionCruda.Respuesta respuesta = login(cab("Host", "novagest.example", "Origin",
					"https://novagest.example", "X-Forwarded-Proto", "https", "X-Forwarded-For", clienteNuevo()));

			// Credenciales invalidas (401), no "Invalid CORS request" (403): el backend reconoce el mismo origen
			assertThat(respuesta.estado()).isEqualTo(401);
		}

		@Test
		void sinElEsquemaReenviadoElMismoPostSiRecibe403_porEsoElProxyDebeEnviarloSiempre() throws Exception {
			PeticionCruda.Respuesta respuesta = login(cab("Host", "novagest.example", "Origin",
					"https://novagest.example", "X-Forwarded-For", clienteNuevo()));

			assertThat(respuesta.estado()).isEqualTo(403);
			assertThat(respuesta.cuerpo()).contains("Invalid CORS request");
		}

	}

	/** Un proxy configurado que NO es el que se conecta: sus cabeceras tampoco valen. */
	@Nested
	@Import(TestcontainersConfiguration.class)
	@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = {
			"server.forward-headers-strategy=native", "server.tomcat.remoteip.internal-proxies=10[.]99[.]\\d{1,3}[.]\\d{1,3}" })
	@ActiveProfiles("test")
	class ConElProxyConfiguradoDistintoDelQueSeConecta extends Base {

		@Test
		void lasCabecerasDeUnOrigenQueNoEsDeConfianzaSeIgnoran() throws Exception {
			assertThat(ipRegistrada(cab("X-Forwarded-For", "198.51.100.77"))).isEqualTo("127.0.0.1");
		}

		@Test
		void tampocoSeAceptaHttpsReenviado() throws Exception {
			PeticionCruda.Respuesta respuesta = PeticionCruda.enviar(puerto, "GET", "/actuator/health",
					cab("X-Forwarded-Proto", "https"), null);

			assertThat(respuesta.cabecera("Strict-Transport-Security")).isNull();
		}

	}

}
