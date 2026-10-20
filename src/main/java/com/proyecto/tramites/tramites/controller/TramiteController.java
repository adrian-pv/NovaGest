package com.proyecto.tramites.tramites.controller;

import com.proyecto.tramites.comun.util.Actor;
import com.proyecto.tramites.tramites.dto.HistorialResponse;
import com.proyecto.tramites.tramites.dto.FiltroTramites;
import com.proyecto.tramites.tramites.dto.TramiteActualizarRequest;
import com.proyecto.tramites.tramites.dto.TramiteRequest;
import com.proyecto.tramites.tramites.dto.TramiteResponse;
import com.proyecto.tramites.tramites.dto.TransicionDisponibleResponse;
import com.proyecto.tramites.tramites.dto.TransicionRequest;
import com.proyecto.tramites.tramites.service.TramiteService;
import com.proyecto.tramites.tramites.service.TransicionTramiteService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** El controlador solo recibe, valida y responde; la logica vive en el servicio. */
@RestController
@RequestMapping("/api/tramites")
public class TramiteController {

	private final TramiteService servicio;
	private final TransicionTramiteService transiciones;

	public TramiteController(TramiteService servicio, TransicionTramiteService transiciones) {
		this.servicio = servicio;
		this.transiciones = transiciones;
	}

	/**
	 * Permiso: tramite:leer. Propios o todos segun el alcance del rol. Orden: id, creadoEn, estado.
	 * Filtros opcionales (tarjeta 17), combinados con Y: estado (uno o varios, repetido o separado por
	 * comas), tipoId, desde y hasta (fecha de creacion AAAA-MM-DD, ambas incluidas, hora de Guatemala).
	 */
	@GetMapping
	@PreAuthorize("hasAuthority('tramite:leer')")
	public Page<TramiteResponse> listar(
			@RequestParam(name = "estado", required = false) List<String> estado,
			@RequestParam(required = false) String tipoId,
			@RequestParam(required = false) String desde,
			@RequestParam(required = false) String hasta,
			@PageableDefault(size = 20, sort = "creadoEn", direction = Sort.Direction.DESC) Pageable paginacion,
			Authentication autenticacion) {
		FiltroTramites filtro = FiltroTramites.de(estado, tipoId, desde, hasta);
		return servicio.listar(Actor.de(autenticacion), filtro, paginacion);
	}

	/** Permiso: tramite:leer. Un tramite ajeno responde 404. */
	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('tramite:leer')")
	public TramiteResponse obtener(@PathVariable Long id, Authentication autenticacion) {
		return servicio.obtener(Actor.de(autenticacion), id);
	}

	/** Permiso: tramite:crear. Abre el tramite en Borrador. */
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('tramite:crear')")
	public TramiteResponse crear(@Valid @RequestBody TramiteRequest solicitud, Authentication autenticacion) {
		return servicio.crear(Actor.de(autenticacion), solicitud);
	}

	/** Permiso: tramite:editar, mas la regla del estado y del dueno. Solo cambia los datos. */
	@PutMapping("/{id}")
	@PreAuthorize("hasAuthority('tramite:editar')")
	public TramiteResponse actualizar(@PathVariable Long id, @Valid @RequestBody TramiteActualizarRequest solicitud,
			Authentication autenticacion) {
		return servicio.actualizar(Actor.de(autenticacion), id, solicitud);
	}

	/**
	 * Permiso: tramite:editar, mas la regla de la transicion (quien puede y en que estado). Es el unico
	 * camino para cambiar el estado. Transicion que no existe: 409; sin autoridad para ella: 403.
	 */
	@PostMapping("/{id}/transiciones")
	@PreAuthorize("hasAuthority('tramite:editar')")
	public TramiteResponse transicionar(@PathVariable Long id, @Valid @RequestBody TransicionRequest solicitud,
			Authentication autenticacion) {
		return transiciones.transicionar(Actor.de(autenticacion), id, solicitud);
	}

	/**
	 * Permiso: tramite:leer. Transiciones que quien consulta puede hacer ahora sobre el tramite; la interfaz pinta solo
	 * esos botones. Sin el permiso tramite:editar la lista llega vacia. Las condiciones sin cumplir llegan como
	 * ejecutable=false con su motivo.
	 */
	@GetMapping("/{id}/transiciones")
	@PreAuthorize("hasAuthority('tramite:leer')")
	public List<TransicionDisponibleResponse> transicionesDisponibles(@PathVariable Long id,
			Authentication autenticacion) {
		boolean puedeEditar = autenticacion.getAuthorities().stream()
				.anyMatch(a -> "tramite:editar".equals(a.getAuthority()));
		return transiciones.disponibles(Actor.de(autenticacion), id, puedeEditar);
	}

	/** Permiso: tramite:leer. Cambios de estado del tramite, del mas antiguo al mas reciente. */
	@GetMapping("/{id}/historial")
	@PreAuthorize("hasAuthority('tramite:leer')")
	public List<HistorialResponse> historial(@PathVariable Long id, Authentication autenticacion) {
		return servicio.historial(Actor.de(autenticacion), id);
	}

	/** Permiso: tramite:eliminar. Borrado logico. */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasAuthority('tramite:eliminar')")
	public void eliminar(@PathVariable Long id, Authentication autenticacion) {
		servicio.eliminar(Actor.de(autenticacion), id);
	}

}
