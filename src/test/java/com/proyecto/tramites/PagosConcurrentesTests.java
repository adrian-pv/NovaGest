package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.jayway.jsonpath.JsonPath;
import com.proyecto.tramites.usuarios.entity.Usuario;
import com.proyecto.tramites.usuarios.repository.RolRepository;
import com.proyecto.tramites.usuarios.repository.UsuarioRepository;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Pagos con dos personas al mismo tiempo. La resolucion de un pago (validar o rechazar) leia el pago pendiente y
 * escribia despues sin bloquearlo: si otra persona lo resolvia entre las dos cosas, la segunda decision pisaba a la
 * primera y las dos respondian 200 (dinero validado y rechazado a la vez, con dos entradas en la bitacora). Estas pruebas
 * exigen que una sola decision gane y la otra reciba 409.
 * <p>
 * Estas pruebas CONFIRMAN datos (necesitan dos transacciones reales), y la bitacora no se puede borrar. Por eso corren
 * en su propia base PostgreSQL, que se descarta al terminar la clase: no ensucian la base que usan las demas pruebas.
 */
@Import(BaseAislada.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PagosConcurrentesTests {

	private static final String CLAVE = "clave-segura-123";
	private static final String DATOS_COMPLETOS =
			"{\"dpi\":\"1234567890123\",\"ocupacion\":\"Comerciante\",\"ingreso_mensual\":3500.5}";
	private static final byte[] PDF = "%PDF-1.4\n% comprobante de prueba\n".getBytes(StandardCharsets.UTF_8);
	private static final Path CARPETA = Path.of("target", "comprobantes-prueba");

	@Autowired
	private MockMvc mvc;

	@Autowired
	private UsuarioRepository usuarios;

	@Autowired
	private RolRepository roles;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private PlatformTransactionManager gestorTransacciones;

	private final ExecutorService hilos = Executors.newFixedThreadPool(4);

	private TransactionTemplate transaccion;
	private String ciudadano;
	private String gestorA;
	private String gestorB;
	private long idGestorB;

	@BeforeEach
	void personas() throws Exception {
		transaccion = new TransactionTemplate(gestorTransacciones);
		String sufijo = UUID.randomUUID().toString().substring(0, 8);
		ciudadano = tokenCon("ana-" + sufijo + "@demo.com", "CIUDADANO");
		gestorA = tokenCon("gabi-" + sufijo + "@demo.com", "GESTOR");
		gestorB = tokenCon("beto-" + sufijo + "@demo.com", "GESTOR");
		idGestorB = jdbc.queryForObject("SELECT id FROM usuario WHERE correo = ?", Long.class,
				"beto-" + sufijo + "@demo.com");
	}

	@AfterEach
	void cerrar() {
		hilos.shutdownNow();
	}

	// ---------- Ayudas ----------

	private MockHttpServletResponse enviar(HttpMethod metodo, String ruta, String token, String cuerpo) throws Exception {
		var peticion = request(metodo, ruta);
		if (cuerpo != null) {
			peticion = peticion.contentType(MediaType.APPLICATION_JSON).content(cuerpo);
		}
		if (token != null) {
			peticion = peticion.header("Authorization", "Bearer " + token);
		}
		return mvc.perform(peticion).andReturn().getResponse();
	}

	private String tokenCon(String correo, String rol) throws Exception {
		mvc.perform(post("/api/auth/registro").contentType(MediaType.APPLICATION_JSON).content(
				"{\"nombre\":\"Persona Prueba\",\"correo\":\"" + correo + "\",\"clave\":\"" + CLAVE + "\"}"));
		transaccion.executeWithoutResult(estado -> {
			Usuario usuario = usuarios.findByCorreoIgnoreCaseAndEliminadoEnIsNull(correo).orElseThrow();
			usuario.getRoles().clear();
			usuario.getRoles().add(roles.findByNombre(rol).orElseThrow());
			usuarios.saveAndFlush(usuario);
		});
		String cuerpo = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"correo\":\"" + correo + "\",\"clave\":\"" + CLAVE + "\"}"))
				.andReturn().getResponse().getContentAsString();
		return JsonPath.read(cuerpo, "$.accessToken");
	}

	/** Un tramite del ciudadano, ya en POR_PAGAR. */
	private long tramitePorPagar() throws Exception {
		String tipos = enviar(HttpMethod.GET, "/api/tipos-tramite?size=100", ciudadano, null).getContentAsString();
		long ornato = JsonPath.<List<Number>>read(tipos, "$.content[?(@.nombre=='Boleto de ornato')].id").get(0)
				.longValue();
		MockHttpServletResponse r = enviar(HttpMethod.POST, "/api/tramites", ciudadano,
				"{\"tipoId\":" + ornato + ",\"datos\":" + DATOS_COMPLETOS + "}");
		long id = JsonPath.<Number>read(r.getContentAsString(), "$.id").longValue();
		jdbc.update("UPDATE tramite SET estado = 'POR_PAGAR' WHERE id = ?", id);
		return id;
	}

	private MockHttpServletResponse subir(long tramiteId) throws Exception {
		MockMultipartHttpServletRequestBuilder peticion = multipart("/api/tramites/" + tramiteId + "/pagos")
				.file(new MockMultipartFile("comprobante", "recibo.pdf", "application/pdf", PDF));
		return mvc.perform((MockMultipartHttpServletRequestBuilder) peticion.header("Authorization",
				"Bearer " + ciudadano)).andReturn().getResponse();
	}

	/** Un pago PENDIENTE con su tramite en POR_PAGAR. Devuelve {tramiteId, pagoId}. */
	private long[] pagoPendiente() throws Exception {
		long tramite = tramitePorPagar();
		MockHttpServletResponse r = subir(tramite);
		assertThat(r.getStatus()).isEqualTo(201);
		return new long[] { tramite, JsonPath.<Number>read(r.getContentAsString(), "$.id").longValue() };
	}

	private MockHttpServletResponse resolver(String token, long pagoId, String decision) throws Exception {
		String cuerpo = "RECHAZAR".equals(decision)
				? "{\"decision\":\"RECHAZAR\",\"comentario\":\"No coincide con el monto\"}"
				: "{\"decision\":\"VALIDAR\"}";
		return enviar(HttpMethod.POST, "/api/pagos/" + pagoId + "/validacion", token, cuerpo);
	}

	private String estadoDelPago(long pagoId) {
		return jdbc.queryForObject("SELECT estado FROM pago WHERE id = ?", String.class, pagoId);
	}

	private String estadoDelTramite(long tramiteId) {
		return jdbc.queryForObject("SELECT estado FROM tramite WHERE id = ?", String.class, tramiteId);
	}

	private int resolucionesEnBitacora(long pagoId) {
		return jdbc.queryForObject("SELECT count(*) FROM bitacora WHERE recurso = 'pago' AND recurso_id = ? "
				+ "AND accion IN ('VALIDACION_PAGO', 'RECHAZO_PAGO')", Integer.class, pagoId);
	}

	/** Espera a que alguna consulta de esta base este detenida esperando un bloqueo de fila. */
	private void esperarUnaConsultaBloqueada() throws InterruptedException {
		long limite = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
		while (System.nanoTime() < limite) {
			Integer esperando = jdbc.queryForObject(
					"SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
					Integer.class);
			if (esperando != null && esperando > 0) {
				return;
			}
			Thread.sleep(25);
		}
		throw new AssertionError("Ninguna consulta quedo esperando el bloqueo de la fila del pago");
	}

	// ---------- Pruebas ----------

	@Test
	void siOtraPersonaResuelveElPagoMientrasSeEstaResolviendoLaDecisionTardiaRecibe409YNoPisaLaPrimera()
			throws Exception {
		long[] pago = pagoPendiente();
		long tramite = pago[0];
		long pagoId = pago[1];
		CountDownLatch filaTomada = new CountDownLatch(1);
		CountDownLatch soltar = new CountDownLatch(1);

		// "Otra persona" tiene la fila del pago en una transaccion abierta y la resuelve (rechaza) antes de soltarla
		Future<?> otraPersona = hilos.submit(() -> transaccion.executeWithoutResult(estado -> {
			jdbc.queryForList("SELECT id FROM pago WHERE id = ? FOR UPDATE", pagoId);
			filaTomada.countDown();
			try {
				soltar.await(20, TimeUnit.SECONDS);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			jdbc.update("UPDATE pago SET estado = 'RECHAZADO', validado_por = ?, validado_en = now(), "
					+ "comentario = 'Resuelto por otra persona' WHERE id = ?", idGestorB, pagoId);
		}));
		assertThat(filaTomada.await(10, TimeUnit.SECONDS)).isTrue();

		// Mientras tanto, el gestor A intenta validar ese mismo pago
		Future<MockHttpServletResponse> decisionTardia = hilos.submit(() -> resolver(gestorA, pagoId, "VALIDAR"));
		esperarUnaConsultaBloqueada();
		assertThat(decisionTardia.isDone()).as("la decision espera a que la fila quede libre").isFalse();
		soltar.countDown();
		otraPersona.get(10, TimeUnit.SECONDS);
		MockHttpServletResponse respuesta = decisionTardia.get(20, TimeUnit.SECONDS);

		assertThat(respuesta.getStatus()).as("la decision tardia no puede pisar la primera").isEqualTo(409);
		assertThat(estadoDelPago(pagoId)).isEqualTo("RECHAZADO");
		assertThat(jdbc.queryForObject("SELECT comentario FROM pago WHERE id = ?", String.class, pagoId))
				.isEqualTo("Resuelto por otra persona");
		assertThat(estadoDelTramite(tramite)).as("el tramite no se finaliza con un pago rechazado")
				.isEqualTo("POR_PAGAR");
		assertThat(resolucionesEnBitacora(pagoId)).as("la decision tardia no deja rastro de haberse aplicado")
				.isZero();
	}

	@Test
	void dosGestoresQueResuelvenElMismoPagoALaVezNuncaGananLosDosYTodoQuedaCoherente() throws Exception {
		for (int ronda = 1; ronda <= 6; ronda++) {
			long[] pago = pagoPendiente();
			long tramite = pago[0];
			long pagoId = pago[1];
			CountDownLatch salida = new CountDownLatch(1);
			Future<MockHttpServletResponse> validar = hilos.submit(() -> {
				salida.await();
				return resolver(gestorA, pagoId, "VALIDAR");
			});
			Future<MockHttpServletResponse> rechazar = hilos.submit(() -> {
				salida.await();
				return resolver(gestorB, pagoId, "RECHAZAR");
			});
			salida.countDown();
			List<Integer> estados = new ArrayList<>(
					List.of(validar.get(30, TimeUnit.SECONDS).getStatus(), rechazar.get(30, TimeUnit.SECONDS).getStatus()));
			estados.sort(Integer::compare);

			String detalle = "ronda " + ronda;
			assertThat(estados).as(detalle + ": una decision gana y la otra recibe 409").containsExactly(200, 409);
			assertThat(resolucionesEnBitacora(pagoId)).as(detalle + ": una sola resolucion en la bitacora").isEqualTo(1);
			String estadoPago = estadoDelPago(pagoId);
			assertThat(estadoPago).as(detalle).isIn("VALIDADO", "RECHAZADO");
			assertThat(estadoDelTramite(tramite)).as(detalle + ": el tramite coincide con la decision ganadora")
					.isEqualTo("VALIDADO".equals(estadoPago) ? "FINALIZADO" : "POR_PAGAR");
		}
	}

	@Test
	void dosComprobantesDelMismoTramiteAlaVezDejanUnSoloPagoPendienteYUnSoloArchivo() throws Exception {
		long tramite = tramitePorPagar();
		long archivosAntes = contarArchivos();
		CountDownLatch salida = new CountDownLatch(1);
		List<Future<MockHttpServletResponse>> subidas = new ArrayList<>();
		for (int i = 0; i < 2; i++) {
			subidas.add(hilos.submit(() -> {
				salida.await();
				return subir(tramite);
			}));
		}
		salida.countDown();
		List<Integer> estados = new ArrayList<>();
		for (Future<MockHttpServletResponse> subida : subidas) {
			estados.add(subida.get(30, TimeUnit.SECONDS).getStatus());
		}
		estados.sort(Integer::compare);

		assertThat(estados).containsExactly(201, 409);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM pago WHERE tramite_id = ? AND estado = 'PENDIENTE'",
				Integer.class, tramite)).isEqualTo(1);
		assertThat(contarArchivos() - archivosAntes).as("el comprobante del pago que perdio no queda en disco")
				.isEqualTo(1);
	}

	private static long contarArchivos() throws Exception {
		if (!Files.exists(CARPETA)) {
			return 0;
		}
		try (var archivos = Files.list(CARPETA)) {
			return archivos.count();
		}
	}

}
