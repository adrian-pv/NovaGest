package com.proyecto.tramites.usuarios.controller;

import com.proyecto.tramites.comun.util.Actor;
import com.proyecto.tramites.usuarios.dto.PermisoResponse;
import com.proyecto.tramites.usuarios.dto.RolRequest;
import com.proyecto.tramites.usuarios.dto.RolResponse;
import com.proyecto.tramites.usuarios.service.RolService;
import jakarta.validation.Valid;
import java.util.List;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Tarjeta 12: administracion de roles y su conjunto de permisos. */
@RestController
@RequestMapping("/api/roles")
public class RolController {

	private final RolService servicio;

	public RolController(RolService servicio) {
		this.servicio = servicio;
	}

	/** Permiso: rol:leer. Todos los roles con sus permisos. */
	@GetMapping
	@PreAuthorize("hasAuthority('rol:leer')")
	public List<RolResponse> listar() {
		return servicio.listar();
	}

	/** Permiso: rol:leer. Catalogo de permisos (recurso:accion) que se pueden asignar a un rol. */
	@GetMapping("/permisos")
	@PreAuthorize("hasAuthority('rol:leer')")
	public List<PermisoResponse> permisos() {
		return servicio.listarPermisos();
	}

	/** Permiso: rol:leer. */
	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('rol:leer')")
	public RolResponse obtener(@PathVariable Long id) {
		return servicio.obtener(id);
	}

	/** Permiso: rol:crear. */
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('rol:crear')")
	public RolResponse crear(@Valid @RequestBody RolRequest solicitud, Authentication autenticacion) {
		return servicio.crear(Actor.de(autenticacion), solicitud);
	}

	/** Permiso: rol:editar. Reemplaza nombre, descripcion, alcance y la lista completa de permisos. */
	@PutMapping("/{id}")
	@PreAuthorize("hasAuthority('rol:editar')")
	public RolResponse actualizar(@PathVariable Long id, @Valid @RequestBody RolRequest solicitud,
			Authentication autenticacion) {
		return servicio.actualizar(Actor.de(autenticacion), id, solicitud);
	}

	/** Permiso: rol:eliminar. Solo roles creados por el equipo y sin usuarios asignados. */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasAuthority('rol:eliminar')")
	public void eliminar(@PathVariable Long id, Authentication autenticacion) {
		servicio.eliminar(Actor.de(autenticacion), id);
	}

}
