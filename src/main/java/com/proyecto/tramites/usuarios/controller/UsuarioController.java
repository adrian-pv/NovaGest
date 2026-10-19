package com.proyecto.tramites.usuarios.controller;

import com.proyecto.tramites.comun.util.Actor;
import com.proyecto.tramites.comun.util.SoloAutenticado;
import com.proyecto.tramites.usuarios.dto.PerfilResponse;
import com.proyecto.tramites.usuarios.dto.UsuarioActualizarRequest;
import com.proyecto.tramites.usuarios.dto.UsuarioAdminResponse;
import com.proyecto.tramites.usuarios.dto.UsuarioCrearRequest;
import com.proyecto.tramites.usuarios.service.UsuarioAdminService;
import com.proyecto.tramites.usuarios.service.UsuarioService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

/** El controlador solo recibe, valida y responde; la logica vive en los servicios. */
@RestController
@RequestMapping("/api/usuarios")
public class UsuarioController {

	private final UsuarioService servicio;
	private final UsuarioAdminService administracion;

	public UsuarioController(UsuarioService servicio, UsuarioAdminService administracion) {
		this.servicio = servicio;
		this.administracion = administracion;
	}

	/** Solo exige estar autenticado: devuelve el perfil de quien hace la peticion. */
	@GetMapping("/yo")
	@SoloAutenticado
	public PerfilResponse yo(Authentication autenticacion) {
		return servicio.perfilDe(Long.valueOf(autenticacion.getName()));
	}

	/**
	 * Permiso: usuario:leer. Parametros: page, size (maximo 100), sort (nombre, correo, creadoEn), activo,
	 * rol (nombre exacto, por ejemplo GESTOR) y buscar (texto en el nombre o el correo).
	 */
	@GetMapping
	@PreAuthorize("hasAuthority('usuario:leer')")
	public Page<UsuarioAdminResponse> listar(@RequestParam(required = false) Boolean activo,
			@RequestParam(required = false) String rol, @RequestParam(required = false) String buscar,
			@PageableDefault(size = 20, sort = "nombre") Pageable paginacion) {
		return administracion.listar(activo, rol, buscar, paginacion);
	}

	/** Permiso: usuario:leer. */
	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('usuario:leer')")
	public UsuarioAdminResponse obtener(@PathVariable Long id) {
		return administracion.obtener(id);
	}

	/** Permiso: usuario:crear. Crea un usuario con los roles indicados por nombre. */
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('usuario:crear')")
	public UsuarioAdminResponse crear(@Valid @RequestBody UsuarioCrearRequest solicitud, Authentication autenticacion) {
		return administracion.crear(Actor.de(autenticacion), solicitud);
	}

	/** Permiso: usuario:editar. Cambia nombre, estado activo y roles. Nadie puede cambiarse sus propios roles. */
	@PutMapping("/{id}")
	@PreAuthorize("hasAuthority('usuario:editar')")
	public UsuarioAdminResponse actualizar(@PathVariable Long id,
			@Valid @RequestBody UsuarioActualizarRequest solicitud, Authentication autenticacion) {
		return administracion.actualizar(Actor.de(autenticacion), id, solicitud);
	}

	/** Permiso: usuario:editar. Quita el bloqueo por intentos fallidos de inicio de sesion. */
	@PostMapping("/{id}/desbloquear")
	@PreAuthorize("hasAuthority('usuario:editar')")
	public UsuarioAdminResponse desbloquear(@PathVariable Long id, Authentication autenticacion) {
		return administracion.desbloquear(Actor.de(autenticacion), id);
	}

	/** Permiso: usuario:eliminar. Borrado logico; revoca sus sesiones. Nadie puede eliminarse a si mismo. */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasAuthority('usuario:eliminar')")
	public void eliminar(@PathVariable Long id, Authentication autenticacion) {
		administracion.eliminar(Actor.de(autenticacion), id);
	}

}
