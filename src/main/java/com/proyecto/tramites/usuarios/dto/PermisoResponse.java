package com.proyecto.tramites.usuarios.dto;

import com.proyecto.tramites.usuarios.entity.Permiso;

/** Tarjeta 12: catalogo de permisos para armar un rol. nombre es recurso:accion. */
public record PermisoResponse(Long id, String nombre, String recurso, String accion) {

	public static PermisoResponse de(Permiso permiso) {
		return new PermisoResponse(permiso.getId(), permiso.getNombre(), permiso.getRecurso(), permiso.getAccion());
	}

}
