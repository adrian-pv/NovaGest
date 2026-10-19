package com.proyecto.tramites.usuarios.dto;

import com.proyecto.tramites.usuarios.entity.Permiso;
import com.proyecto.tramites.usuarios.entity.Rol;
import java.util.List;

/** Tarjeta 12: un rol con sus permisos (recurso:accion), ordenados. */
public record RolResponse(Long id, String nombre, String descripcion, boolean alcanceTotal, List<String> permisos) {

	public static RolResponse de(Rol rol) {
		List<String> permisos = rol.getPermisos().stream().map(Permiso::getNombre).sorted().toList();
		return new RolResponse(rol.getId(), rol.getNombre(), rol.getDescripcion(), rol.isAlcanceTotal(), permisos);
	}

}
