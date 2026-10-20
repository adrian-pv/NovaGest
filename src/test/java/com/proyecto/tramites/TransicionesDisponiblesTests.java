package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.jayway.jsonpath.JsonPath;
import com.proyecto.tramites.tramites.entity.EstadoTramite;
import com.proyecto.tramites.tramites.service.ConsultaPagos;
import com.proyecto.tramites.usuarios.entity.Usuario;
import com.proyecto.tramites.usuarios.repository.RolRepository;
import com.proyecto.tramites.usuarios.repository.UsuarioRepository;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tarjeta 28: GET /api/tramites/{id}/transiciones devuelve lo que quien consulta puede hacer ahora, con las mismas
 * reglas que aplica el POST. La prueba de consistencia garantiza que la lista nunca contradice al POST.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class TransicionesDisponiblesTests {

	private static final String CLAVE = "clave-segura-123";
	private static final String RUTA = "/api/tramites";
	private static final String DATOS_COMPLETOS =
			"{\"dpi\":\"1234567890123\",\"ocupacion\":\"Comerciante\",\"ingreso_mensual\":3500.5}";

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

	@MockitoBean
	private ConsultaPagos pagos;

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
		Usuario usuario = usuarios.findByCorreoIgnoreCaseAndEliminadoEnIsNull(correo).orElseThrow();
		usuario.getRoles().clear();
		usuario.getRoles().add(roles.findByNombre(rol).orElseThrow());
		usuarios.saveAndFlush(usuario);
		String cuerpo = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"correo\":\"" + correo + "\",\"clave\":\"" + CLAVE + "\"}"))
				.andReturn().getResponse().getContentAsString();
		return JsonPath.read(cuerpo, "$.accessToken");
	}

	private long crearTramite(String token, String datos) throws Exception {
		String tipos = enviar(HttpMethod.GET, "/api/tipos-tramite?size=100", token, null).getContentAsString();
		long ornato = JsonPath.<List<Number>>read(tipos, "$.content[?(@.nombre=='Boleto de ornato')].id").get(0).longValue();
		MockHttpServletResponse r = enviar(HttpMethod.POST, RUTA, token,
				"{\"tipoId\":" + ornato + ",\"datos\":" + datos + "}");
		assertThat(r.getStatus()).isEqualTo(201);
		return JsonPath.<Number>read(r.getContentAsString(), "$.id").longValue();
	}

	private void ponerEstado(long idTramite, String estado) {
		em.flush();
		jdbc.update("UPDATE tramite SET estado = ? WHERE id = ?", estado, idTramite);
		em.clear();
	}

	private List<String> acciones(String token, long id) throws Exception {
		MockHttpServletResponse r = enviar(HttpMethod.GET, RUTA + "/" + id + "/transiciones", token, null);
		assertThat(r.getStatus()).isEqualTo(200);
		return JsonPath.read(r.getContentAsString(), "$[*].accion");
	}

	private Map<String, Object> accion(String token, long id, String nombre) throws Exception {
		MockHttpServletResponse r = enviar(HttpMethod.GET, RUTA + "/" + id + "/transiciones", token, null);
		List<Map<String, Object>> lista = JsonPath.read(r.getContentAsString(), "$[?(@.accion=='" + nombre + "')]");
		assertThat(lista).hasSize(1);
		return lista.get(0);
	}

	@Test
	void laDuenaEnBorradorConDatosCompletosPuedeEnviar() throws Exception {
		String duena = tokenCon("duena@demo.com", "CIUDADANO");
		long id = crearTramite(duena, DATOS_COMPLETOS);

		assertThat(acciones(duena, id)).containsExactly("ENVIAR");
		Map<String, Object> enviar = accion(duena, id, "ENVIAR");
		assertThat(enviar.get("estadoDestino")).isEqualTo("ENVIADO");
		assertThat(enviar.get("ejecutable")).isEqualTo(true);
		assertThat(enviar.get("comentarioObligatorio")).isEqualTo(false);
		assertThat(enviar.get("motivo")).isNull();
	}

	@Test
	void conDatosIncompletosEnviarApareceNoEjecutableConSuMotivo() throws Exception {
		String duena = tokenCon("duena@demo.com", "CIUDADANO");
		long id = crearTramite(duena, "{}");

		Map<String, Object> enviar = accion(duena, id, "ENVIAR");
		assertThat(enviar.get("ejecutable")).isEqualTo(false);
		assertThat(enviar.get("motivo")).isEqualTo("Faltan campos obligatorios del tramite");
	}

	@Test
	void elGestorNoVeEnviarPorqueEsDeLaDuena() throws Exception {
		String duena = tokenCon("duena@demo.com", "CIUDADANO");
		String gestor = tokenCon("gestor@demo.com", "GESTOR");
		long id = crearTramite(duena, DATOS_COMPLETOS);

		assertThat(acciones(gestor, id)).isEmpty();
	}

	@Test
	void elGestorEnRevisionVeObservarAprobarYRechazarConSusComentarios() throws Exception {
		String duena = tokenCon("duena@demo.com", "CIUDADANO");
		String gestor = tokenCon("gestor@demo.com", "GESTOR");
		long id = crearTramite(duena, DATOS_COMPLETOS);
		ponerEstado(id, "EN_REVISION");

		assertThat(acciones(gestor, id)).containsExactlyInAnyOrder("OBSERVAR", "APROBAR_REVISION", "RECHAZAR");
		assertThat(accion(gestor, id, "OBSERVAR").get("comentarioObligatorio")).isEqualTo(true);
		assertThat(accion(gestor, id, "RECHAZAR").get("comentarioObligatorio")).isEqualTo(true);
		assertThat(accion(gestor, id, "APROBAR_REVISION").get("comentarioObligatorio")).isEqualTo(false);
		assertThat(acciones(duena, id)).isEmpty();
	}

	@Test
	void enEnviadoElGestorPuedeTomarloYLaDuenaNoPuedeNada() throws Exception {
		String duena = tokenCon("duena@demo.com", "CIUDADANO");
		String gestor = tokenCon("gestor@demo.com", "GESTOR");
		long id = crearTramite(duena, DATOS_COMPLETOS);
		ponerEstado(id, "ENVIADO");

		assertThat(acciones(gestor, id)).containsExactly("TOMAR_EN_REVISION");
		assertThat(acciones(duena, id)).isEmpty();
	}

	@Test
	void enObservadoSoloLaDuenaPuedeCorregir() throws Exception {
		String duena = tokenCon("duena@demo.com", "CIUDADANO");
		String gestor = tokenCon("gestor@demo.com", "GESTOR");
		long id = crearTramite(duena, DATOS_COMPLETOS);
		ponerEstado(id, "OBSERVADO");

		assertThat(acciones(duena, id)).containsExactly("CORREGIR");
		assertThat(acciones(gestor, id)).isEmpty();
	}

	@Test
	void finalizarDependeDelPagoValidado() throws Exception {
		String duena = tokenCon("duena@demo.com", "CIUDADANO");
		String gestor = tokenCon("gestor@demo.com", "GESTOR");
		long id = crearTramite(duena, DATOS_COMPLETOS);
		ponerEstado(id, "POR_PAGAR");

		when(pagos.tienePagoValidado(anyLong())).thenReturn(false);
		Map<String, Object> sinPago = accion(gestor, id, "FINALIZAR");
		assertThat(sinPago.get("ejecutable")).isEqualTo(false);
		assertThat(sinPago.get("motivo")).isEqualTo("El tramite no tiene un pago validado");

		when(pagos.tienePagoValidado(anyLong())).thenReturn(true);
		assertThat(accion(gestor, id, "FINALIZAR").get("ejecutable")).isEqualTo(true);
	}

	@ParameterizedTest
	@EnumSource(value = EstadoTramite.class, names = { "FINALIZADO", "RECHAZADO" })
	void losEstadosFinalesNoOfrecenNingunaTransicion(EstadoTramite estado) throws Exception {
		String admin = tokenCon("admin@demo.com", "ADMINISTRADOR");
		long id = crearTramite(admin, DATOS_COMPLETOS);
		ponerEstado(id, estado.name());

		assertThat(acciones(admin, id)).isEmpty();
	}

	@Test
	void quienNoPuedeEditarRecibeLaListaVacia() throws Exception {
		String duena = tokenCon("duena@demo.com", "CIUDADANO");
		String auditor = tokenCon("auditor@demo.com", "AUDITOR");
		long id = crearTramite(duena, DATOS_COMPLETOS);
		ponerEstado(id, "EN_REVISION");

		assertThat(acciones(auditor, id)).isEmpty();
	}

	@Test
	void unTramiteAjenoOInexistenteResponde404() throws Exception {
		String duena = tokenCon("duena@demo.com", "CIUDADANO");
		String otro = tokenCon("otro@demo.com", "CIUDADANO");
		long id = crearTramite(duena, DATOS_COMPLETOS);

		assertThat(enviar(HttpMethod.GET, RUTA + "/" + id + "/transiciones", otro, null).getStatus()).isEqualTo(404);
		assertThat(enviar(HttpMethod.GET, RUTA + "/999999/transiciones", duena, null).getStatus()).isEqualTo(404);
	}

	@Test
	void sinTokenResponde401() throws Exception {
		assertThat(enviar(HttpMethod.GET, RUTA + "/1/transiciones", null, null).getStatus()).isEqualTo(401);
	}

	/**
	 * La lista nunca contradice al POST: en cada estado, lo que se anuncia como ejecutable se puede ejecutar (200) y
	 * lo que se anuncia como no ejecutable falla por su condicion (400 o 409), nunca por falta de autoridad.
	 */
	@ParameterizedTest
	@EnumSource(EstadoTramite.class)
	void laListaConcuerdaConLoQueRealmenteHaceElPost(EstadoTramite estado) throws Exception {
		String duena = tokenCon("duena@demo.com", "CIUDADANO");
		String gestor = tokenCon("gestor@demo.com", "GESTOR");
		long id = crearTramite(duena, DATOS_COMPLETOS);
		for (String token : List.of(duena, gestor)) {
			ponerEstado(id, estado.name());
			MockHttpServletResponse lista = enviar(HttpMethod.GET, RUTA + "/" + id + "/transiciones", token, null);
			List<Map<String, Object>> anunciadas = JsonPath.read(lista.getContentAsString(), "$");
			for (Map<String, Object> t : anunciadas) {
				ponerEstado(id, estado.name());
				String cuerpo = "{\"estadoDestino\":\"" + t.get("estadoDestino") + "\",\"comentario\":\"motivo\"}";
				int estatus = enviar(HttpMethod.POST, RUTA + "/" + id + "/transiciones", token, cuerpo).getStatus();
				if (Boolean.TRUE.equals(t.get("ejecutable"))) {
					assertThat(estatus).as("%s desde %s", t.get("accion"), estado).isEqualTo(200);
				}
				else {
					assertThat(estatus).as("%s desde %s", t.get("accion"), estado).isIn(400, 409);
				}
			}
		}
	}

}
