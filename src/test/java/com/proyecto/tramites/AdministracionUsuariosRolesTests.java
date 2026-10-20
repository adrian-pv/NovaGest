package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.jayway.jsonpath.JsonPath;
import com.proyecto.tramites.usuarios.entity.Usuario;
import com.proyecto.tramites.usuarios.repository.RolRepository;
import com.proyecto.tramites.usuarios.repository.UsuarioRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tarjeta 12: administracion de usuarios y roles. Cada prueba se revierte al terminar (@Transactional).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdministracionUsuariosRolesTests {

	private static final String CLAVE = "clave-segura-123";
	private static final String USUARIOS = "/api/usuarios";
	private static final String ROLES = "/api/roles";

	@Autowired
	private MockMvc mvc;

	@Autowired
	private UsuarioRepository usuarios;

	@Autowired
	private RolRepository roles;

	@Autowired
	private JdbcTemplate jdbc;

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

	private MockHttpServletResponse login(String correo, String clave) throws Exception {
		return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"correo\":\"" + correo + "\",\"clave\":\"" + clave + "\"}")).andReturn().getResponse();
	}

	/** Registra un usuario, le deja solo el rol indicado, inicia sesion y devuelve su token. */
	private String tokenCon(String correo, String rol) throws Exception {
		mvc.perform(post("/api/auth/registro").contentType(MediaType.APPLICATION_JSON).content(
				"{\"nombre\":\"Persona Prueba\",\"correo\":\"" + correo + "\",\"clave\":\"" + CLAVE + "\"}"));
		Usuario usuario = usuarios.findByCorreoIgnoreCaseAndEliminadoEnIsNull(correo).orElseThrow();
		usuario.getRoles().clear();
		usuario.getRoles().add(roles.findByNombre(rol).orElseThrow());
		usuarios.saveAndFlush(usuario);
		return JsonPath.read(login(correo, CLAVE).getContentAsString(), "$.accessToken");
	}

	private long idDe(String correo) {
		return usuarios.findByCorreoIgnoreCaseAndEliminadoEnIsNull(correo).orElseThrow().getId();
	}

	private static String nuevoUsuario(String correo, String... roles) {
		return "{\"nombre\":\"Usuario Nuevo\",\"correo\":\"" + correo + "\",\"clave\":\"" + CLAVE + "\",\"roles\":"
				+ lista(roles) + "}";
	}

	private static String edicion(String nombre, boolean activo, String... roles) {
		return "{\"nombre\":\"" + nombre + "\",\"activo\":" + activo + ",\"roles\":" + lista(roles) + "}";
	}

	private static String rol(String nombre, boolean alcanceTotal, String... permisos) {
		return "{\"nombre\":\"" + nombre + "\",\"descripcion\":\"Rol de prueba\",\"alcanceTotal\":" + alcanceTotal
				+ ",\"permisos\":" + lista(permisos) + "}";
	}

	private static String lista(String... valores) {
		return valores.length == 0 ? "[]" : "[\"" + String.join("\",\"", valores) + "\"]";
	}

	private long crearUsuario(String admin, String correo, String... roles) throws Exception {
		MockHttpServletResponse r = enviar(HttpMethod.POST, USUARIOS, admin, nuevoUsuario(correo, roles));
		assertThat(r.getStatus()).isEqualTo(201);
		return JsonPath.<Number>read(r.getContentAsString(), "$.id").longValue();
	}

	private long crearRol(String admin, String nombre, String... permisos) throws Exception {
		MockHttpServletResponse r = enviar(HttpMethod.POST, ROLES, admin, rol(nombre, false, permisos));
		assertThat(r.getStatus()).isEqualTo(201);
		return JsonPath.<Number>read(r.getContentAsString(), "$.id").longValue();
	}

	private long idRol(String nombre) {
		return roles.findByNombre(nombre).orElseThrow().getId();
	}

	// ---------- Permisos por rol ----------

	@Test
	void sinTokenEs401() throws Exception {
		assertThat(enviar(HttpMethod.GET, USUARIOS, null, null).getStatus()).isEqualTo(401);
		assertThat(enviar(HttpMethod.GET, ROLES, null, null).getStatus()).isEqualTo(401);
	}

	@ParameterizedTest
	@CsvSource({ "CIUDADANO,403", "GESTOR,200", "AUDITOR,200", "ADMINISTRADOR,200" })
	void listarUsuariosExigeUsuarioLeer(String rol, int esperado) throws Exception {
		assertThat(enviar(HttpMethod.GET, USUARIOS, tokenCon("persona@demo.com", rol), null).getStatus())
				.isEqualTo(esperado);
	}

	@ParameterizedTest
	@CsvSource({ "CIUDADANO,403", "GESTOR,403", "AUDITOR,403", "ADMINISTRADOR,201" })
	void soloElAdministradorCreaUsuarios(String rol, int esperado) throws Exception {
		String token = tokenCon("persona@demo.com", rol);

		assertThat(enviar(HttpMethod.POST, USUARIOS, token, nuevoUsuario("nuevo@demo.com", "GESTOR")).getStatus())
				.isEqualTo(esperado);
	}

	@ParameterizedTest
	@CsvSource({ "CIUDADANO,403", "GESTOR,403", "AUDITOR,200", "ADMINISTRADOR,200" })
	void listarRolesExigeRolLeer(String rol, int esperado) throws Exception {
		assertThat(enviar(HttpMethod.GET, ROLES, tokenCon("persona@demo.com", rol), null).getStatus())
				.isEqualTo(esperado);
	}

	@ParameterizedTest
	@CsvSource({ "CIUDADANO,403", "GESTOR,403", "AUDITOR,403", "ADMINISTRADOR,201" })
	void soloElAdministradorCreaRoles(String rol, int esperado) throws Exception {
		String token = tokenCon("persona@demo.com", rol);

		assertThat(enviar(HttpMethod.POST, ROLES, token, rol("CAJERO", false, "pago:leer")).getStatus())
				.isEqualTo(esperado);
	}

	@Test
	void sinPermisoEs403AunqueElCuerpoSeaInvalido() throws Exception {
		String auditor = tokenCon("auditor@demo.com", "AUDITOR");

		assertThat(enviar(HttpMethod.POST, USUARIOS, auditor, "{}").getStatus()).isEqualTo(403);
		assertThat(enviar(HttpMethod.PUT, ROLES + "/1", auditor, "{}").getStatus()).isEqualTo(403);
	}

	// ---------- Usuarios ----------

	@Test
	void elAdministradorCreaUnUsuarioQuePuedeEntrarConSusRoles() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");

		long id = crearUsuario(admin, "Gestora@Demo.com", "gestor");

		MockHttpServletResponse r = enviar(HttpMethod.GET, USUARIOS + "/" + id, admin, null);
		assertThat(JsonPath.<String>read(r.getContentAsString(), "$.correo")).isEqualTo("gestora@demo.com");
		assertThat(JsonPath.<List<String>>read(r.getContentAsString(), "$.roles")).containsExactly("GESTOR");
		assertThat(JsonPath.<Boolean>read(r.getContentAsString(), "$.activo")).isTrue();
		assertThat(r.getContentAsString()).doesNotContain("hash").doesNotContain(CLAVE);
		String token = JsonPath.read(login("gestora@demo.com", CLAVE).getContentAsString(), "$.accessToken");
		assertThat(enviar(HttpMethod.GET, USUARIOS, token, null).getStatus()).isEqualTo(200);
	}

	@Test
	void correoRepetidoEs409YRolInexistenteEs400() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");

		assertThat(enviar(HttpMethod.POST, USUARIOS, admin, nuevoUsuario("ADMIN@demo.com", "GESTOR")).getStatus())
				.isEqualTo(409);
		MockHttpServletResponse r = enviar(HttpMethod.POST, USUARIOS, admin, nuevoUsuario("otro@demo.com", "NO_EXISTE"));
		assertThat(r.getStatus()).isEqualTo(400);
		assertThat(r.getContentAsString()).contains("NO_EXISTE");
		assertThat(enviar(HttpMethod.POST, USUARIOS, admin, nuevoUsuario("sinroles@demo.com")).getStatus())
				.isEqualTo(400);
	}

	@Test
	void cambiarLosRolesAplicaDeInmediatoAlTokenQueYaTenia() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		assertThat(enviar(HttpMethod.GET, USUARIOS, ana, null).getStatus()).isEqualTo(403);

		MockHttpServletResponse r = enviar(HttpMethod.PUT, USUARIOS + "/" + idDe("ana@demo.com"), admin,
				edicion("Ana Auditora", true, "AUDITOR"));

		assertThat(r.getStatus()).isEqualTo(200);
		assertThat(JsonPath.<String>read(r.getContentAsString(), "$.nombre")).isEqualTo("Ana Auditora");
		assertThat(enviar(HttpMethod.GET, USUARIOS, ana, null).getStatus()).isEqualTo(200);
	}

	@Test
	void desactivarCortaElAccesoYRevocaLasSesiones() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		long id = idDe("ana@demo.com");

		assertThat(enviar(HttpMethod.PUT, USUARIOS + "/" + id, admin, edicion("Ana", false, "CIUDADANO")).getStatus())
				.isEqualTo(200);

		assertThat(enviar(HttpMethod.GET, USUARIOS + "/yo", ana, null).getStatus()).isEqualTo(401);
		assertThat(login("ana@demo.com", CLAVE).getStatus()).isEqualTo(401);
		Integer vigentes = jdbc.queryForObject(
				"SELECT count(*) FROM token_renovacion WHERE usuario_id = ? AND revocado_en IS NULL", Integer.class, id);
		assertThat(vigentes).isZero();
	}

	@Test
	void nadiePuedeQuitarseSusRolesDesactivarseNiEliminarseASiMismo() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		long yo = idDe("admin@demo.com");

		assertThat(enviar(HttpMethod.PUT, USUARIOS + "/" + yo, admin, edicion("Admin", true, "CIUDADANO")).getStatus())
				.isEqualTo(409);
		assertThat(enviar(HttpMethod.PUT, USUARIOS + "/" + yo, admin, edicion("Admin", false, "ADMINISTRADOR"))
				.getStatus()).isEqualTo(409);
		assertThat(enviar(HttpMethod.DELETE, USUARIOS + "/" + yo, admin, null).getStatus()).isEqualTo(409);
		// Cambiar solo su nombre si se permite
		assertThat(enviar(HttpMethod.PUT, USUARIOS + "/" + yo, admin, edicion("Admin Nuevo", true, "ADMINISTRADOR"))
				.getStatus()).isEqualTo(200);
	}

	@Test
	void eliminarEsLogicoYLiberaElCorreo() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		long id = crearUsuario(admin, "temporal@demo.com", "GESTOR");

		assertThat(enviar(HttpMethod.DELETE, USUARIOS + "/" + id, admin, null).getStatus()).isEqualTo(204);

		assertThat(enviar(HttpMethod.GET, USUARIOS + "/" + id, admin, null).getStatus()).isEqualTo(404);
		Integer marcadas = jdbc.queryForObject(
				"SELECT count(*) FROM usuario WHERE id = ? AND eliminado_en IS NOT NULL AND activo = FALSE",
				Integer.class, id);
		assertThat(marcadas).isEqualTo(1);
		crearUsuario(admin, "temporal@demo.com", "GESTOR");
	}

	@Test
	void desbloquearPermiteEntrarAntesDeQueVenzaElBloqueo() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		long id = crearUsuario(admin, "bloqueada@demo.com", "CIUDADANO");
		// Se bloquea por medio de la entidad y no con SQL directo: la prueba comparte la transaccion con la API y
		// Hibernate ya tiene al usuario en memoria; un UPDATE por SQL no lo veria y el login seguiria entrando.
		Usuario bloqueada = usuarios.findById(id).orElseThrow();
		bloqueada.setIntentosFallidos(5);
		bloqueada.setBloqueadoHasta(Instant.now().plus(15, ChronoUnit.MINUTES));
		usuarios.saveAndFlush(bloqueada);
		assertThat(login("bloqueada@demo.com", CLAVE).getStatus()).isEqualTo(401);
		assertThat(JsonPath.<Boolean>read(enviar(HttpMethod.GET, USUARIOS + "/" + id, admin, null).getContentAsString(),
				"$.bloqueado")).isTrue();

		MockHttpServletResponse r = enviar(HttpMethod.POST, USUARIOS + "/" + id + "/desbloquear", admin, null);

		assertThat(r.getStatus()).isEqualTo(200);
		assertThat(JsonPath.<Boolean>read(r.getContentAsString(), "$.bloqueado")).isFalse();
		assertThat(login("bloqueada@demo.com", CLAVE).getStatus()).isEqualTo(200);
	}

	@Test
	void elListadoFiltraPorRolEstadoYTexto() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		crearUsuario(admin, "gestor.uno@demo.com", "GESTOR");
		long inactivo = crearUsuario(admin, "gestor.dos@demo.com", "GESTOR", "AUDITOR");
		enviar(HttpMethod.PUT, USUARIOS + "/" + inactivo, admin, edicion("Usuario Nuevo", false, "GESTOR", "AUDITOR"));

		List<String> gestores = JsonPath.read(enviar(HttpMethod.GET, USUARIOS + "?rol=GESTOR", admin, null)
				.getContentAsString(), "$.content[*].correo");
		List<String> activos = JsonPath.read(enviar(HttpMethod.GET, USUARIOS + "?rol=GESTOR&activo=true", admin, null)
				.getContentAsString(), "$.content[*].correo");
		List<String> porTexto = JsonPath.read(enviar(HttpMethod.GET, USUARIOS + "?buscar=UNO@demo", admin, null)
				.getContentAsString(), "$.content[*].correo");

		assertThat(gestores).containsExactlyInAnyOrder("gestor.uno@demo.com", "gestor.dos@demo.com");
		assertThat(activos).containsExactly("gestor.uno@demo.com");
		assertThat(porTexto).containsExactly("gestor.uno@demo.com");
		assertThat(enviar(HttpMethod.GET, USUARIOS + "?sort=hashContrasena", admin, null).getStatus()).isEqualTo(400);
	}

	// ---------- Roles ----------

	@Test
	void elCatalogoTieneLos25PermisosYLosRolesTraenLosSuyos() throws Exception {
		String auditor = tokenCon("auditor@demo.com", "AUDITOR");

		List<String> permisos = JsonPath.read(enviar(HttpMethod.GET, ROLES + "/permisos", auditor, null)
				.getContentAsString(), "$[*].nombre");
		List<String> nombres = JsonPath.read(enviar(HttpMethod.GET, ROLES, auditor, null).getContentAsString(),
				"$[*].nombre");
		List<String> delAuditor = JsonPath.read(enviar(HttpMethod.GET, ROLES + "/" + idRol("AUDITOR"), auditor, null)
				.getContentAsString(), "$.permisos");

		assertThat(permisos).hasSize(25).contains("tramite:leer", "bitacora:leer");
		assertThat(nombres).contains("CIUDADANO", "GESTOR", "AUDITOR", "ADMINISTRADOR");
		assertThat(delAuditor).contains("bitacora:leer").doesNotContain("usuario:crear");
	}

	@Test
	void unRolNuevoDaSusPermisosAQuienLoRecibe() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		crearRol(admin, "CONSULTOR_USUARIOS", "usuario:leer");
		String ana = tokenCon("ana@demo.com", "CIUDADANO");
		assertThat(enviar(HttpMethod.GET, USUARIOS, ana, null).getStatus()).isEqualTo(403);

		enviar(HttpMethod.PUT, USUARIOS + "/" + idDe("ana@demo.com"), admin,
				edicion("Ana", true, "CIUDADANO", "CONSULTOR_USUARIOS"));

		assertThat(enviar(HttpMethod.GET, USUARIOS, ana, null).getStatus()).isEqualTo(200);
	}

	@Test
	void losDatosInvalidosDeUnRolSon400YElNombreRepetido409() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");

		assertThat(enviar(HttpMethod.POST, ROLES, admin, rol("CAJERO", false, "pago:volar")).getStatus()).isEqualTo(400);
		assertThat(enviar(HttpMethod.POST, ROLES, admin, rol("cajero", false, "pago:leer")).getStatus()).isEqualTo(400);
		assertThat(enviar(HttpMethod.POST, ROLES, admin, "{\"nombre\":\"CAJERO\"}").getStatus()).isEqualTo(400);
		assertThat(enviar(HttpMethod.POST, ROLES, admin, rol("GESTOR", false, "pago:leer")).getStatus()).isEqualTo(409);
	}

	@Test
	void editarUnRolReemplazaSusPermisos() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		long id = crearRol(admin, "CAJERO", "pago:leer");

		MockHttpServletResponse r = enviar(HttpMethod.PUT, ROLES + "/" + id, admin,
				rol("CAJERO_PRINCIPAL", true, "pago:leer", "pago:editar"));

		assertThat(r.getStatus()).isEqualTo(200);
		assertThat(JsonPath.<String>read(r.getContentAsString(), "$.nombre")).isEqualTo("CAJERO_PRINCIPAL");
		assertThat(JsonPath.<Boolean>read(r.getContentAsString(), "$.alcanceTotal")).isTrue();
		assertThat(JsonPath.<List<String>>read(r.getContentAsString(), "$.permisos"))
				.containsExactly("pago:editar", "pago:leer");
		assertThat(enviar(HttpMethod.PUT, ROLES + "/999999", admin, rol("NADA", false)).getStatus()).isEqualTo(404);
	}

	@Test
	void losRolesBaseNoSeRenombranNiSeEliminan() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		long gestor = idRol("GESTOR");

		assertThat(enviar(HttpMethod.PUT, ROLES + "/" + gestor, admin, rol("REVISOR", true, "tramite:leer"))
				.getStatus()).isEqualTo(409);
		assertThat(enviar(HttpMethod.DELETE, ROLES + "/" + gestor, admin, null).getStatus()).isEqualTo(409);
		// Sus permisos si se pueden ajustar
		assertThat(enviar(HttpMethod.PUT, ROLES + "/" + gestor, admin, rol("GESTOR", true, "tramite:leer"))
				.getStatus()).isEqualTo(200);
	}

	@Test
	void unRolConUsuariosNoSeEliminaYUnoLibreSi() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		long enUso = crearRol(admin, "CAJERO", "pago:leer");
		crearUsuario(admin, "cajera@demo.com", "CAJERO");
		long libre = crearRol(admin, "TEMPORAL", "pago:leer");

		assertThat(enviar(HttpMethod.DELETE, ROLES + "/" + enUso, admin, null).getStatus()).isEqualTo(409);
		assertThat(enviar(HttpMethod.DELETE, ROLES + "/" + libre, admin, null).getStatus()).isEqualTo(204);
		assertThat(enviar(HttpMethod.GET, ROLES + "/" + libre, admin, null).getStatus()).isEqualTo(404);
	}

	@Test
	void elAdministradorNoPuedeQuitarseAsiMismoRolEditar() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");

		MockHttpServletResponse r = enviar(HttpMethod.PUT, ROLES + "/" + idRol("ADMINISTRADOR"), admin,
				rol("ADMINISTRADOR", true, "usuario:leer", "rol:leer"));

		assertThat(r.getStatus()).isEqualTo(409);
		assertThat(enviar(HttpMethod.GET, ROLES, admin, null).getStatus()).isEqualTo(200);
	}

	// ---------- Bitacora ----------

	@Test
	void cadaCambioQuedaEnLaBitacoraSinDatosPersonales() throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		long usuario = crearUsuario(admin, "secreta@demo.com", "GESTOR");
		enviar(HttpMethod.PUT, USUARIOS + "/" + usuario, admin, edicion("Nombre Secreto", true, "AUDITOR"));
		enviar(HttpMethod.DELETE, USUARIOS + "/" + usuario, admin, null);
		long rol = crearRol(admin, "CAJERO", "pago:leer");
		enviar(HttpMethod.PUT, ROLES + "/" + rol, admin, rol("CAJERO", false, "pago:leer", "pago:editar"));
		enviar(HttpMethod.DELETE, ROLES + "/" + rol, admin, null);

		List<String> acciones = jdbc.queryForList(
				"SELECT accion FROM bitacora WHERE recurso IN ('usuario', 'rol') AND actor_id = ? "
						+ "AND accion <> 'REGISTRO_USUARIO' ORDER BY id",
				String.class, idDe("admin@demo.com"));
		String todo = String.join(" ", jdbc.queryForList(
				"SELECT coalesce(antes::text,'') || ' ' || coalesce(despues::text,'') FROM bitacora", String.class));

		assertThat(acciones).containsExactly("CREAR_USUARIO", "EDITAR_USUARIO", "ELIMINAR_USUARIO", "CREAR_ROL",
				"EDITAR_ROL", "ELIMINAR_ROL");
		assertThat(todo).doesNotContain("secreta@demo.com").doesNotContain("Nombre Secreto").doesNotContain(CLAVE)
				.doesNotContain("$2");
	}

}
