package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.jayway.jsonpath.JsonPath;
import com.proyecto.tramites.usuarios.entity.Usuario;
import com.proyecto.tramites.usuarios.repository.RolRepository;
import com.proyecto.tramites.usuarios.repository.UsuarioRepository;
import jakarta.persistence.EntityManager;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Tarjeta 18: pagos con comprobante, validacion por un gestor y segregacion de funciones. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PagosTests {

	private static final String CLAVE = "clave-segura-123";
	private static final String DATOS_COMPLETOS =
			"{\"dpi\":\"1234567890123\",\"ocupacion\":\"Comerciante\",\"ingreso_mensual\":3500.5}";
	private static final Path CARPETA = Path.of("target", "comprobantes-prueba");

	private static final byte[] PDF = "%PDF-1.4\n% comprobante de prueba\n".getBytes(StandardCharsets.UTF_8);
	private static final byte[] PNG = relleno(new byte[] { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A }, 64);
	private static final byte[] JPG = relleno(new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0 }, 64);

	@Autowired
	private MockMvc mvc;

	@Autowired
	private UsuarioRepository usuarios;

	@Autowired
	private RolRepository roles;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private EntityManager em;

	private static byte[] relleno(byte[] cabecera, int largo) {
		byte[] resultado = Arrays.copyOf(cabecera, largo);
		return resultado;
	}

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

	private MockHttpServletResponse subir(String token, long tramiteId, String nombre, String tipo, byte[] contenido)
			throws Exception {
		var peticion = multipart("/api/tramites/" + tramiteId + "/pagos")
				.file(new MockMultipartFile("comprobante", nombre, tipo, contenido));
		if (token != null) {
			peticion = (org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder) peticion
					.header("Authorization", "Bearer " + token);
		}
		return mvc.perform(peticion).andReturn().getResponse();
	}

	private String tokenCon(String correo, String rol) throws Exception {
		mvc.perform(post("/api/auth/registro").contentType(MediaType.APPLICATION_JSON).content(
				"{\"nombre\":\"Persona Prueba\",\"correo\":\"" + correo + "\",\"clave\":\"" + CLAVE + "\"}"));
		Usuario usuario = usuarios.findByCorreoIgnoreCaseAndEliminadoEnIsNull(correo).orElseThrow();
		usuario.getRoles().clear();
		usuario.getRoles().add(roles.findByNombre(rol).orElseThrow());
		usuarios.saveAndFlush(usuario);
		String cuerpo = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"correo\":\"" + correo + "\",\"clave\":\"" + CLAVE + "\"}"))
				.andReturn().getResponse().getContentAsString();
		return JsonPath.read(cuerpo, "$.accessToken");
	}

	private long idUsuario(String token) throws Exception {
		return JsonPath.<Number>read(enviar(HttpMethod.GET, "/api/usuarios/yo", token, null).getContentAsString(), "$.id")
				.longValue();
	}

	/** Crea un tramite de ornato del ciudadano y lo deja en el estado indicado. */
	private long tramiteEn(String token, String estado) throws Exception {
		String tipos = enviar(HttpMethod.GET, "/api/tipos-tramite?size=100", token, null).getContentAsString();
		long ornato = JsonPath.<List<Number>>read(tipos, "$.content[?(@.nombre=='Boleto de ornato')].id").get(0).longValue();
		MockHttpServletResponse r = enviar(HttpMethod.POST, "/api/tramites", token,
				"{\"tipoId\":" + ornato + ",\"datos\":" + DATOS_COMPLETOS + "}");
		long id = JsonPath.<Number>read(r.getContentAsString(), "$.id").longValue();
		em.flush();
		jdbc.update("UPDATE tramite SET estado = ? WHERE id = ?", estado, id);
		em.clear();
		return id;
	}

	private long subirPago(String token, long tramiteId) throws Exception {
		MockHttpServletResponse r = subir(token, tramiteId, "recibo.pdf", "application/pdf", PDF);
		assertThat(r.getStatus()).isEqualTo(201);
		return JsonPath.<Number>read(r.getContentAsString(), "$.id").longValue();
	}

	private MockHttpServletResponse resolver(String token, long pagoId, String decision, String comentario) throws Exception {
		String cuerpo = comentario == null
				? "{\"decision\":\"" + decision + "\"}"
				: "{\"decision\":\"" + decision + "\",\"comentario\":\"" + comentario + "\"}";
		return enviar(HttpMethod.POST, "/api/pagos/" + pagoId + "/validacion", token, cuerpo);
	}

	private String estadoDelTramite(String token, long id) throws Exception {
		return JsonPath.read(enviar(HttpMethod.GET, "/api/tramites/" + id, token, null).getContentAsString(), "$.estado");
	}

	private static String sha256(byte[] contenido) throws Exception {
		return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(contenido));
	}

	// ---------- Registrar un pago ----------

	@Test
	void elCiudadanoRegistraUnPagoConSuComprobanteEnUnTramitePorPagar() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		jdbc.update("UPDATE tipo_tramite SET monto = 25.50 WHERE nombre = 'Boleto de ornato'");
		em.clear();

		MockHttpServletResponse r = subir(ana, tramite, "recibo.pdf", "application/pdf", PDF);

		assertThat(r.getStatus()).isEqualTo(201);
		String cuerpo = r.getContentAsString();
		assertThat(JsonPath.<String>read(cuerpo, "$.estado")).isEqualTo("PENDIENTE");
		assertThat(JsonPath.<Number>read(cuerpo, "$.monto").doubleValue()).isEqualTo(25.5);
		assertThat(JsonPath.<String>read(cuerpo, "$.comprobanteTipo")).isEqualTo("application/pdf");
		assertThat(JsonPath.<String>read(cuerpo, "$.tramiteEstado")).isEqualTo("POR_PAGAR");
		assertThat(JsonPath.<Number>read(cuerpo, "$.creadoPor").longValue()).isEqualTo(idUsuario(ana));
		assertThat(cuerpo).doesNotContain("comprobanteArchivo").doesNotContain("recibo.pdf");
	}

	@Test
	void elArchivoSeGuardaConNombreGeneradoYSuHashEsElDelContenido() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long tramite = tramiteEn(ana, "POR_PAGAR");

		MockHttpServletResponse r = subir(ana, tramite, "../../recibo-peligroso.pdf", "application/pdf", PDF);

		assertThat(r.getStatus()).isEqualTo(201);
		long pago = JsonPath.<Number>read(r.getContentAsString(), "$.id").longValue();
		String archivo = jdbc.queryForObject("SELECT comprobante_archivo FROM pago WHERE id = ?", String.class, pago);
		assertThat(archivo).matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.pdf")
				.doesNotContain("recibo").doesNotContain("..");
		Path enDisco = CARPETA.resolve(archivo);
		assertThat(Files.exists(enDisco)).isTrue();
		assertThat(Files.readAllBytes(enDisco)).isEqualTo(PDF);
		assertThat(JsonPath.<String>read(r.getContentAsString(), "$.comprobanteHash")).isEqualTo(sha256(PDF));
		assertThat(JsonPath.<Number>read(r.getContentAsString(), "$.comprobanteTamano").longValue()).isEqualTo(PDF.length);
	}

	@ParameterizedTest
	@CsvSource({ "recibo.pdf,application/pdf,PDF", "foto.png,image/png,PNG", "foto.jpg,image/jpeg,JPG" })
	void seAceptanPdfPngYJpg(String nombre, String tipo, String formato) throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		byte[] contenido = switch (formato) {
			case "PDF" -> PDF;
			case "PNG" -> PNG;
			default -> JPG;
		};

		MockHttpServletResponse r = subir(ana, tramite, nombre, tipo, contenido);

		assertThat(r.getStatus()).isEqualTo(201);
		assertThat(JsonPath.<String>read(r.getContentAsString(), "$.comprobanteTipo")).isEqualTo(tipo);
	}

	@Test
	void elTipoSeReconocePorElContenidoNoPorLoQueDigaElCliente() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		byte[] texto = "esto es un texto plano, no un pdf".getBytes(StandardCharsets.UTF_8);
		byte[] ejecutable = relleno(new byte[] { 'M', 'Z', (byte) 0x90, 0x00 }, 64);

		assertThat(subir(ana, tramite, "recibo.pdf", "application/pdf", texto).getStatus()).isEqualTo(400);
		assertThat(subir(ana, tramite, "foto.png", "image/png", ejecutable).getStatus()).isEqualTo(400);
		assertThat(subir(ana, tramite, "script.sh", "text/x-shellscript", texto).getStatus()).isEqualTo(400);
		MockHttpServletResponse r = subir(ana, tramite, "x.pdf", "application/pdf", texto);
		assertThat(JsonPath.<List<String>>read(r.getContentAsString(), "$.errores[*].campo")).contains("comprobante");
		Integer pagos = jdbc.queryForObject("SELECT count(*) FROM pago", Integer.class);
		assertThat(pagos).isZero();
	}

	@Test
	void unArchivoVacioOUnaPeticionSinArchivoSon400() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long tramite = tramiteEn(ana, "POR_PAGAR");

		assertThat(subir(ana, tramite, "vacio.pdf", "application/pdf", new byte[0]).getStatus()).isEqualTo(400);
		MockHttpServletResponse sinArchivo = mvc.perform(multipart("/api/tramites/" + tramite + "/pagos")
				.header("Authorization", "Bearer " + ana)).andReturn().getResponse();
		assertThat(sinArchivo.getStatus()).isEqualTo(400);
		MockHttpServletResponse comoJson = enviar(HttpMethod.POST, "/api/tramites/" + tramite + "/pagos", ana, "{}");
		assertThat(comoJson.getStatus()).isEqualTo(400);
	}

	@Test
	void unArchivoDeMasDeCincoMegabytesEs413() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		byte[] grande = new byte[5 * 1024 * 1024 + 1];
		System.arraycopy(PDF, 0, grande, 0, PDF.length);

		assertThat(subir(ana, tramite, "grande.pdf", "application/pdf", grande).getStatus()).isEqualTo(413);
		byte[] justo = new byte[5 * 1024 * 1024];
		System.arraycopy(PDF, 0, justo, 0, PDF.length);
		assertThat(subir(ana, tramite, "justo.pdf", "application/pdf", justo).getStatus()).isEqualTo(201);
	}

	@ParameterizedTest
	@CsvSource({ "BORRADOR", "ENVIADO", "EN_REVISION", "OBSERVADO", "FINALIZADO", "RECHAZADO" })
	void soloSePuedePagarUnTramiteEnPorPagar(String estado) throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long tramite = tramiteEn(ana, estado);

		assertThat(subir(ana, tramite, "recibo.pdf", "application/pdf", PDF).getStatus()).isEqualTo(409);
	}

	@Test
	void noSePuedeRegistrarUnSegundoPagoMientrasHayUnoPendiente() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		subirPago(ana, tramite);

		assertThat(subir(ana, tramite, "otro.pdf", "application/pdf", PDF).getStatus()).isEqualTo(409);
	}

	@Test
	void elTramiteDeOtroCiudadanoResponde404() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		String luis = tokenCon("luis@demo.com", "CIUDADANO");
		long deAna = tramiteEn(ana, "POR_PAGAR");

		assertThat(subir(luis, deAna, "recibo.pdf", "application/pdf", PDF).getStatus()).isEqualTo(404);
		assertThat(subir(ana, 999_999L, "recibo.pdf", "application/pdf", PDF).getStatus()).isEqualTo(404);
	}

	@ParameterizedTest
	@CsvSource({ "CIUDADANO,201", "GESTOR,403", "AUDITOR,403", "ADMINISTRADOR,201" })
	void soloQuienTienePermisoDeCrearPuedeRegistrarUnPago(String rol, int esperado) throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		String token = rol.equals("CIUDADANO") ? ana : tokenCon("persona@demo.com", rol);

		assertThat(subir(token, tramite, "recibo.pdf", "application/pdf", PDF).getStatus()).isEqualTo(esperado);
	}

	@Test
	void sinTokenEs401() throws Exception {
		assertThat(subir(null, 1, "recibo.pdf", "application/pdf", PDF).getStatus()).isEqualTo(401);
		assertThat(enviar(HttpMethod.GET, "/api/pagos", null, null).getStatus()).isEqualTo(401);
		assertThat(resolver(null, 1, "VALIDAR", null).getStatus()).isEqualTo(401);
	}

	// ---------- Consultar y descargar ----------

	@Test
	void elCiudadanoVeSoloSusPagosYElGestorVeTodos() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		String luis = tokenCon("luis@demo.com", "CIUDADANO");
		String gil = tokenCon("gil@demo.com", "GESTOR");
		long pagoAna = subirPago(ana, tramiteEn(ana, "POR_PAGAR"));
		long pagoLuis = subirPago(luis, tramiteEn(luis, "POR_PAGAR"));

		List<Number> deLuis = JsonPath.read(enviar(HttpMethod.GET, "/api/pagos", luis, null).getContentAsString(),
				"$.content[*].id");
		List<Number> deGil = JsonPath.read(enviar(HttpMethod.GET, "/api/pagos", gil, null).getContentAsString(),
				"$.content[*].id");

		assertThat(deLuis).extracting(Number::longValue).containsExactly(pagoLuis);
		assertThat(deGil).extracting(Number::longValue).contains(pagoAna, pagoLuis);
		assertThat(enviar(HttpMethod.GET, "/api/pagos/" + pagoAna, luis, null).getStatus()).isEqualTo(404);
		assertThat(enviar(HttpMethod.GET, "/api/pagos/" + pagoAna, ana, null).getStatus()).isEqualTo(200);
		assertThat(enviar(HttpMethod.GET, "/api/pagos/" + pagoAna, gil, null).getStatus()).isEqualTo(200);
	}

	@Test
	void elListadoSeFiltraPorEstadoYTramiteYSoloOrdenaPorCamposPermitidos() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		String gil = tokenCon("gil@demo.com", "GESTOR");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		long pago = subirPago(ana, tramite);
		resolver(gil, pago, "RECHAZAR", "Comprobante ilegible");
		long segundo = subirPago(ana, tramite);

		List<Number> pendientes = JsonPath.read(
				enviar(HttpMethod.GET, "/api/pagos?estado=PENDIENTE", gil, null).getContentAsString(), "$.content[*].id");
		List<Number> rechazados = JsonPath.read(
				enviar(HttpMethod.GET, "/api/pagos?estado=RECHAZADO&tramiteId=" + tramite, gil, null).getContentAsString(),
				"$.content[*].id");

		assertThat(pendientes).extracting(Number::longValue).contains(segundo).doesNotContain(pago);
		assertThat(rechazados).extracting(Number::longValue).containsExactly(pago);
		assertThat(enviar(HttpMethod.GET, "/api/pagos?estado=INVENTADO", gil, null).getStatus()).isEqualTo(400);
		assertThat(enviar(HttpMethod.GET, "/api/pagos?sort=comprobanteArchivo,asc", gil, null).getStatus()).isEqualTo(400);
	}

	@Test
	void elComprobanteSeDescargaTalCualSeSubio() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		String luis = tokenCon("luis@demo.com", "CIUDADANO");
		String gil = tokenCon("gil@demo.com", "GESTOR");
		long pago = JsonPath.<Number>read(subir(ana, tramiteEn(ana, "POR_PAGAR"), "foto.png", "image/png", PNG)
				.getContentAsString(), "$.id").longValue();

		MockHttpServletResponse r = enviar(HttpMethod.GET, "/api/pagos/" + pago + "/comprobante", ana, null);

		assertThat(r.getStatus()).isEqualTo(200);
		assertThat(r.getContentAsByteArray()).isEqualTo(PNG);
		assertThat(r.getContentType()).isEqualTo("image/png");
		assertThat(r.getHeader("Content-Disposition")).startsWith("attachment").contains("comprobante-" + pago + ".png");
		assertThat(enviar(HttpMethod.GET, "/api/pagos/" + pago + "/comprobante", gil, null).getStatus()).isEqualTo(200);
		assertThat(enviar(HttpMethod.GET, "/api/pagos/" + pago + "/comprobante", luis, null).getStatus()).isEqualTo(404);
		assertThat(enviar(HttpMethod.GET, "/api/pagos/" + pago + "/comprobante", null, null).getStatus()).isEqualTo(401);
	}

	@Test
	void siElArchivoAunNoLlegoALaCarpetaDeEstaInstanciaLaDescargaEs409ConMensajeClaro() throws Exception {
		// Dos instancias sincronizan sus carpetas con demora: el pago ya esta en la base pero el archivo aun no llega
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long pago = JsonPath.<Number>read(subir(ana, tramiteEn(ana, "POR_PAGAR"), "foto.png", "image/png", PNG)
				.getContentAsString(), "$.id").longValue();
		String archivo = jdbc.queryForObject("SELECT comprobante_archivo FROM pago WHERE id = ?", String.class, pago);
		Files.delete(CARPETA.resolve(archivo));

		MockHttpServletResponse r = enviar(HttpMethod.GET, "/api/pagos/" + pago + "/comprobante", ana, null);

		assertThat(r.getStatus()).isEqualTo(409);
		assertThat(r.getContentType()).contains("problem+json");
		assertThat(r.getContentAsString()).contains("todavia no esta disponible").doesNotContain(archivo);
	}

	// ---------- Validar o rechazar ----------

	@Test
	void validarUnPagoFinalizaElTramiteConHistorialYBitacora() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		String gil = tokenCon("gil@demo.com", "GESTOR");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		long pago = subirPago(ana, tramite);

		MockHttpServletResponse r = resolver(gil, pago, "VALIDAR", "Pago verificado");

		assertThat(r.getStatus()).isEqualTo(200);
		String cuerpo = r.getContentAsString();
		assertThat(JsonPath.<String>read(cuerpo, "$.estado")).isEqualTo("VALIDADO");
		assertThat(JsonPath.<Number>read(cuerpo, "$.validadoPor").longValue()).isEqualTo(idUsuario(gil));
		assertThat(JsonPath.<String>read(cuerpo, "$.tramiteEstado")).isEqualTo("FINALIZADO");
		assertThat(estadoDelTramite(ana, tramite)).isEqualTo("FINALIZADO");

		String historial = enviar(HttpMethod.GET, "/api/tramites/" + tramite + "/historial", ana, null).getContentAsString();
		assertThat(JsonPath.<List<String>>read(historial, "$[*].estadoNuevo")).endsWith("FINALIZADO");
		List<Number> actores = JsonPath.read(historial, "$[*].actorId");
		assertThat(actores.get(actores.size() - 1).longValue()).isEqualTo(idUsuario(gil));
		List<String> acciones = jdbc.queryForList("SELECT accion FROM bitacora ORDER BY id", String.class);
		assertThat(acciones).containsSubsequence("CREACION_PAGO", "VALIDACION_PAGO", "TRANSICION_TRAMITE");
	}

	@Test
	void rechazarUnPagoDejaElTramiteEnPorPagarYSePuedeEnviarOtroComprobante() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		String gil = tokenCon("gil@demo.com", "GESTOR");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		long primero = subirPago(ana, tramite);

		MockHttpServletResponse r = resolver(gil, primero, "RECHAZAR", "El comprobante no se lee");

		assertThat(r.getStatus()).isEqualTo(200);
		assertThat(JsonPath.<String>read(r.getContentAsString(), "$.estado")).isEqualTo("RECHAZADO");
		assertThat(JsonPath.<String>read(r.getContentAsString(), "$.comentario")).isEqualTo("El comprobante no se lee");
		assertThat(estadoDelTramite(ana, tramite)).isEqualTo("POR_PAGAR");

		long segundo = subirPago(ana, tramite);
		assertThat(resolver(gil, segundo, "VALIDAR", null).getStatus()).isEqualTo(200);
		assertThat(estadoDelTramite(ana, tramite)).isEqualTo("FINALIZADO");
	}

	@Test
	void rechazarExigeComentario() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		String gil = tokenCon("gil@demo.com", "GESTOR");
		long pago = subirPago(ana, tramiteEn(ana, "POR_PAGAR"));

		for (String comentario : new String[] { null, "", "   " }) {
			MockHttpServletResponse r = resolver(gil, pago, "RECHAZAR", comentario);
			assertThat(r.getStatus()).isEqualTo(400);
			assertThat(JsonPath.<List<String>>read(r.getContentAsString(), "$.errores[*].campo")).contains("comentario");
		}
		assertThat(enviar(HttpMethod.POST, "/api/pagos/" + pago + "/validacion", gil, "{\"decision\":\"INVENTADA\"}")
				.getStatus()).isEqualTo(400);
	}

	@Test
	void unPagoYaResueltoNoSePuedeResolverDeNuevo() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		String gil = tokenCon("gil@demo.com", "GESTOR");
		long pago = subirPago(ana, tramiteEn(ana, "POR_PAGAR"));
		resolver(gil, pago, "VALIDAR", null);

		assertThat(resolver(gil, pago, "VALIDAR", null).getStatus()).isEqualTo(409);
		assertThat(resolver(gil, pago, "RECHAZAR", "Tarde").getStatus()).isEqualTo(409);
	}

	@ParameterizedTest
	@CsvSource({ "CIUDADANO,403", "AUDITOR,403", "GESTOR,200", "ADMINISTRADOR,200" })
	void soloQuienTienePermisoDeEditarPuedeResolver(String rol, int esperado) throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long pago = subirPago(ana, tramiteEn(ana, "POR_PAGAR"));
		String token = rol.equals("CIUDADANO") ? ana : tokenCon("persona@demo.com", rol);

		assertThat(resolver(token, pago, "VALIDAR", null).getStatus()).isEqualTo(esperado);
	}

	@Test
	void quienRegistraUnPagoNoPuedeResolverloSegregacionDeFunciones() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		String otroAdmin = tokenCon("admin2@demo.com", "ADMINISTRADOR");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		long pago = JsonPath.<Number>read(subir(admin, tramite, "recibo.pdf", "application/pdf", PDF).getContentAsString(),
				"$.id").longValue();

		assertThat(resolver(admin, pago, "VALIDAR", null).getStatus()).isEqualTo(403);
		assertThat(resolver(admin, pago, "RECHAZAR", "No").getStatus()).isEqualTo(403);
		assertThat(estadoDelTramite(ana, tramite)).isEqualTo("POR_PAGAR");
		assertThat(resolver(otroAdmin, pago, "VALIDAR", null).getStatus()).isEqualTo(200);
	}

	@Test
	void unGestorNoPuedeFinalizarUnTramiteSinPagoValidadoPorLaTransicionManual() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		String gil = tokenCon("gil@demo.com", "GESTOR");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		long pago = subirPago(ana, tramite);

		assertThat(enviar(HttpMethod.POST, "/api/tramites/" + tramite + "/transiciones", gil,
				"{\"estadoDestino\":\"FINALIZADO\"}").getStatus()).isEqualTo(409);
		resolver(gil, pago, "RECHAZAR", "Falta el sello");
		assertThat(enviar(HttpMethod.POST, "/api/tramites/" + tramite + "/transiciones", gil,
				"{\"estadoDestino\":\"FINALIZADO\"}").getStatus()).isEqualTo(409);
		assertThat(estadoDelTramite(ana, tramite)).isEqualTo("POR_PAGAR");
	}

	@Test
	void siLaFinalizacionFallaElPagoNoQuedaValidado() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		String gil = tokenCon("gil@demo.com", "GESTOR");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		long pago = subirPago(ana, tramite);
		em.flush();
		jdbc.update("UPDATE tramite SET estado = 'EN_REVISION' WHERE id = ?", tramite);
		em.clear();

		MockHttpServletResponse r = resolver(gil, pago, "VALIDAR", null);

		assertThat(r.getStatus()).isEqualTo(409);
	}

	// ---------- Reglas de la base de datos ----------

	@Test
	void laBaseNoDejaQueQuienRegistraUnPagoLoValide() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long pago = subirPago(ana, tramiteEn(ana, "POR_PAGAR"));
		em.flush();

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
				"UPDATE pago SET estado = 'VALIDADO', validado_por = creado_por WHERE id = ?", pago))
				.rootCause().hasMessageContaining("ck_pago_segregacion");
	}

	@Test
	void laBaseSoloPermiteUnPagoPendientePorTramite() throws Exception {
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long tramite = tramiteEn(ana, "POR_PAGAR");
		subirPago(ana, tramite);
		em.flush();

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
				"INSERT INTO pago (tramite_id, ciudadano_id, monto, comprobante_archivo, comprobante_hash, "
						+ "comprobante_tipo, comprobante_tamano, creado_por) "
						+ "SELECT tramite_id, ciudadano_id, monto, 'x.pdf', 'h', 'application/pdf', 1, creado_por FROM pago"))
				.rootCause().hasMessageContaining("uq_pago_pendiente_por_tramite");
	}

}
