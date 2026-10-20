package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.jayway.jsonpath.JsonPath;
import com.proyecto.tramites.comun.config.PermisoPreviaInterceptor;
import com.proyecto.tramites.comun.util.SoloAutenticado;
import com.proyecto.tramites.usuarios.entity.Usuario;
import com.proyecto.tramites.usuarios.repository.RolRepository;
import com.proyecto.tramites.usuarios.repository.UsuarioRepository;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Tarjeta 13: la prueba obligatoria del plan. Descubre TODOS los endpoints del sistema, comprueba que cada
 * uno declare su proteccion y recorre la matriz completa rol por endpoint comparando el codigo HTTP.
 * Si alguien agrega un endpoint sin permiso, esta prueba falla; si lo agrega con permiso, queda cubierto
 * sin escribir nada mas. Deja la evidencia en target/matriz-roles-endpoints.md para el informe de auditoria.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class MatrizDeRolesTests {

	/** Unicas rutas que no exigen token. Cualquier otra que lo omita es un error. */
	static final Set<String> PUBLICOS = Set.of("POST /api/auth/registro", "POST /api/auth/login",
			"POST /api/auth/refresh");

	/** Endpoints de prueba que fallan a proposito; no forman parte de la matriz. */
	private static final Set<String> EXCLUIDOS = Set.of("GET /api/_prueba/falla");

	private static final List<String> ROLES = List.of("CIUDADANO", "GESTOR", "AUDITOR", "ADMINISTRADOR");
	private static final String CLAVE = "clave-segura-123";

	enum Proteccion { PUBLICO, SOLO_AUTENTICADO, PERMISO, EXPRESION_NO_RECONOCIDA, SIN_PROTECCION }

	record Endpoint(String metodo, String patron, Proteccion proteccion, String permiso) {

		String clave() {
			return metodo + " " + patron;
		}

		/**
		 * Ruta de prueba: cada variable de la ruta toma un id que no existe. Asi los endpoints que borran
		 * (por ejemplo DELETE /api/usuarios/{id}, tarjeta 12) nunca tocan a los usuarios que crea esta prueba;
		 * con el id 1 el administrador podia eliminar al ciudadano de la matriz y sus llamadas siguientes daban 401.
		 */
		String ruta() {
			return patron.replaceAll("\\{[^}]+}", "999999");
		}

	}

	@Autowired
	@Qualifier("requestMappingHandlerMapping")
	private RequestMappingHandlerMapping mapeo;

	@Autowired
	private MockMvc mvc;

	@Autowired
	private UsuarioRepository usuarios;

	@Autowired
	private RolRepository roles;

	@Autowired
	private JdbcTemplate jdbc;

	/** Como se clasifica un endpoint segun lo que declara. Es la regla que hace fallar a los endpoints sin permiso. */
	static Proteccion clasificar(String clave, PreAuthorize regla, boolean marcadoSoloAutenticado,
			Matcher[] coincidencia) {
		if (PUBLICOS.contains(clave)) {
			return Proteccion.PUBLICO;
		}
		if (regla != null) {
			Matcher m = PermisoPreviaInterceptor.PERMISO_SIMPLE.matcher(regla.value().trim());
			if (coincidencia != null) {
				coincidencia[0] = m;
			}
			return m.matches() ? Proteccion.PERMISO : Proteccion.EXPRESION_NO_RECONOCIDA;
		}
		return marcadoSoloAutenticado ? Proteccion.SOLO_AUTENTICADO : Proteccion.SIN_PROTECCION;
	}

	private List<Endpoint> descubrirEndpoints() {
		List<Endpoint> encontrados = new ArrayList<>();
		for (Map.Entry<RequestMappingInfo, HandlerMethod> entrada : mapeo.getHandlerMethods().entrySet()) {
			HandlerMethod manejador = entrada.getValue();
			if (!manejador.getBeanType().getName().startsWith("com.proyecto.tramites")) {
				continue; // solo el codigo propio; Swagger y otros componentes del framework no entran
			}
			RequestMappingInfo info = entrada.getKey();
			Set<String> patrones = info.getPatternValues();
			Set<org.springframework.web.bind.annotation.RequestMethod> metodos = info.getMethodsCondition().getMethods();
			for (String patron : patrones) {
				for (var metodo : metodos) {
					String clave = metodo.name() + " " + patron;
					Matcher[] m = new Matcher[1];
					Proteccion proteccion = clasificar(clave, manejador.getMethodAnnotation(PreAuthorize.class),
							manejador.hasMethodAnnotation(SoloAutenticado.class), m);
					String permiso = proteccion == Proteccion.PERMISO && m[0].matches() ? m[0].group(1) : null;
					encontrados.add(new Endpoint(metodo.name(), patron, proteccion, permiso));
				}
			}
		}
		encontrados.sort((a, b) -> a.clave().compareTo(b.clave()));
		return encontrados;
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

	private int llamar(Endpoint endpoint, String token) throws Exception {
		var peticion = request(HttpMethod.valueOf(endpoint.metodo()), endpoint.ruta());
		if (endpoint.metodo().equals("POST") || endpoint.metodo().equals("PUT") || endpoint.metodo().equals("PATCH")) {
			peticion = peticion.contentType(MediaType.APPLICATION_JSON).content("{}");
		}
		if (token != null) {
			peticion = peticion.header("Authorization", "Bearer " + token);
		}
		return mvc.perform(peticion).andReturn().getResponse().getStatus();
	}

	/** Permisos que la base entrega a cada rol (la fuente de verdad de la matriz). */
	private Map<String, Set<String>> permisosPorRol() {
		Map<String, Set<String>> mapa = new HashMap<>();
		jdbc.query("SELECT r.nombre, p.recurso || ':' || p.accion AS permiso FROM rol_permiso rp "
				+ "JOIN rol r ON r.id = rp.rol_id JOIN permiso p ON p.id = rp.permiso_id", resultado -> {
					mapa.computeIfAbsent(resultado.getString(1), k -> new java.util.HashSet<>()).add(resultado.getString(2));
				});
		return mapa;
	}

	// ---------- La regla que hace fallar a los endpoints sin permiso ----------

	/** Controlador de ejemplo para demostrar que la regla detecta cada caso. */
	static class ControladorDeEjemplo {

		void sinProteccion() {
		}

		@PreAuthorize("hasAuthority('tramite:leer')")
		void conPermiso() {
		}

		@PreAuthorize("hasRole('ADMIN')")
		void conExpresionRara() {
		}

		@PreAuthorize("hasAnyAuthority('tramite:leer','tramite:editar')")
		void conVariosPermisos() {
		}

		@SoloAutenticado
		void soloAutenticado() {
		}

		private static PreAuthorize regla(String metodo) throws Exception {
			Method m = ControladorDeEjemplo.class.getDeclaredMethod(metodo);
			return m.getAnnotation(PreAuthorize.class);
		}

	}

	@Test
	void laReglaDetectaUnEndpointSinPermiso() throws Exception {
		assertThat(clasificar("GET /api/x", null, false, null)).isEqualTo(Proteccion.SIN_PROTECCION);
	}

	@Test
	void laReglaAceptaPermisoSimpleYSoloAutenticadoYRechazaLoDemas() throws Exception {
		assertThat(clasificar("GET /api/x", ControladorDeEjemplo.regla("conPermiso"), false, null))
				.isEqualTo(Proteccion.PERMISO);
		assertThat(clasificar("GET /api/x", null, true, null)).isEqualTo(Proteccion.SOLO_AUTENTICADO);
		assertThat(clasificar("GET /api/x", ControladorDeEjemplo.regla("conExpresionRara"), false, null))
				.isEqualTo(Proteccion.EXPRESION_NO_RECONOCIDA);
		assertThat(clasificar("GET /api/x", ControladorDeEjemplo.regla("conVariosPermisos"), false, null))
				.isEqualTo(Proteccion.EXPRESION_NO_RECONOCIDA);
		assertThat(clasificar("POST /api/auth/login", null, false, null)).isEqualTo(Proteccion.PUBLICO);
	}

	// ---------- El sistema real ----------

	@Test
	void todoEndpointDelSistemaDeclaraSuProteccion() {
		List<Endpoint> endpoints = descubrirEndpoints();

		assertThat(endpoints).as("Se esperaban endpoints en el sistema").isNotEmpty();
		List<String> sinProteccion = endpoints.stream()
				.filter(e -> e.proteccion() == Proteccion.SIN_PROTECCION).map(Endpoint::clave).toList();
		List<String> expresionRara = endpoints.stream()
				.filter(e -> e.proteccion() == Proteccion.EXPRESION_NO_RECONOCIDA).map(Endpoint::clave).toList();
		assertThat(sinProteccion)
				.as("Endpoints sin @PreAuthorize(hasAuthority('recurso:accion')) ni @SoloAutenticado")
				.isEmpty();
		assertThat(expresionRara)
				.as("Endpoints con una expresion de permiso que no es hasAuthority('recurso:accion')")
				.isEmpty();
	}

	@Test
	void todoPermisoQueExigeUnEndpointExisteEnLaBase() {
		Set<String> existentes = new java.util.HashSet<>(
				jdbc.queryForList("SELECT recurso || ':' || accion FROM permiso", String.class));

		List<String> inexistentes = descubrirEndpoints().stream()
				.filter(e -> e.proteccion() == Proteccion.PERMISO && !existentes.contains(e.permiso()))
				.map(e -> e.clave() + " exige " + e.permiso()).toList();

		assertThat(inexistentes).as("Endpoints que exigen un permiso que no existe (error de escritura)").isEmpty();
	}

	@Test
	void soloLosEndpointsDeLaListaSonPublicos() {
		List<String> publicos = descubrirEndpoints().stream()
				.filter(e -> e.proteccion() == Proteccion.PUBLICO).map(Endpoint::clave).toList();

		assertThat(publicos).containsExactlyInAnyOrderElementsOf(PUBLICOS);
	}

	@Test
	void laMatrizCompletaDeRolPorEndpointSeCumple() throws Exception {
		List<Endpoint> endpoints = descubrirEndpoints().stream()
				.filter(e -> !EXCLUIDOS.contains(e.clave())).toList();
		Map<String, String> tokens = new LinkedHashMap<>();
		for (String rol : ROLES) {
			tokens.put(rol, tokenCon(rol.toLowerCase() + "@matriz.com", rol));
		}
		Map<String, Set<String>> permisosPorRol = permisosPorRol();
		List<String> fallos = new ArrayList<>();
		Map<String, Map<String, String>> resultados = new TreeMap<>();

		for (Endpoint endpoint : endpoints) {
			Map<String, String> fila = new LinkedHashMap<>();
			resultados.put(endpoint.clave(), fila);

			int anonimo = llamar(endpoint, null);
			fila.put("ANONIMO", String.valueOf(anonimo));
			if (endpoint.proteccion() == Proteccion.PUBLICO ? (anonimo == 401 || anonimo == 403) : anonimo != 401) {
				fallos.add("ANONIMO " + endpoint.clave() + ": esperado "
						+ (endpoint.proteccion() == Proteccion.PUBLICO ? "acceso libre" : "401") + ", obtuvo " + anonimo);
			}

			for (String rol : ROLES) {
				int estado = llamar(endpoint, tokens.get(rol));
				fila.put(rol, String.valueOf(estado));
				boolean autorizado = switch (endpoint.proteccion()) {
					case PERMISO -> permisosPorRol.getOrDefault(rol, Set.of()).contains(endpoint.permiso());
					case SOLO_AUTENTICADO, PUBLICO -> true;
					default -> false;
				};
				if (autorizado && (estado == 401 || estado == 403 || estado >= 500)) {
					fallos.add(rol + " " + endpoint.clave() + ": debia poder entrar, obtuvo " + estado);
				}
				if (!autorizado && estado != 403) {
					fallos.add(rol + " " + endpoint.clave() + ": esperado 403, obtuvo " + estado);
				}
			}
		}

		escribirEvidencia(endpoints, resultados);
		assertThat(fallos).as("Fallos de la matriz rol por endpoint").isEmpty();
	}

	/** Deja la matriz en un archivo legible: sirve de evidencia para el informe de auditoria. */
	private void escribirEvidencia(List<Endpoint> endpoints, Map<String, Map<String, String>> resultados)
			throws IOException {
		StringBuilder md = new StringBuilder("# Matriz de roles por endpoint\n\n");
		md.append("Generada por MatrizDeRolesTests. Cada celda es el codigo HTTP que respondio el sistema.\n");
		md.append("403 = sin permiso, 401 = sin sesion; otro codigo = la accion fue autorizada ")
				.append("(el codigo exacto depende de los datos de la prueba).\n\n");
		md.append("| Endpoint | Proteccion | ANONIMO | CIUDADANO | GESTOR | AUDITOR | ADMINISTRADOR |\n");
		md.append("| --- | --- | --- | --- | --- | --- | --- |\n");
		for (Endpoint e : endpoints) {
			Map<String, String> fila = resultados.get(e.clave());
			String proteccion = e.permiso() != null ? e.permiso() : e.proteccion().name().toLowerCase();
			md.append("| ").append(e.clave()).append(" | ").append(proteccion);
			for (String columna : List.of("ANONIMO", "CIUDADANO", "GESTOR", "AUDITOR", "ADMINISTRADOR")) {
				md.append(" | ").append(fila.get(columna));
			}
			md.append(" |\n");
		}
		Path destino = Path.of("target", "matriz-roles-endpoints.md");
		Files.createDirectories(destino.getParent());
		Files.writeString(destino, md.toString());
	}

}
