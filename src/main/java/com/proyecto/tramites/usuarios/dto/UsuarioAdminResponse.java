package com.proyecto.tramites.usuarios.dto;

import com.proyecto.tramites.usuarios.entity.Rol;
import com.proyecto.tramites.usuarios.entity.Usuario;
import java.time.Instant;
import java.util.List;

/**
 * Tarjeta 12: lo que ve quien administra usuarios. Nunca incluye el hash de la clave.
 * bloqueado indica si la cuenta esta bloqueada ahora mismo por intentos fallidos.
 */
public record UsuarioAdminResponse(Long id, String correo, String nombre, boolean activo, boolean bloqueado,
		List<String> roles, Instant creadoEn, Instant actualizadoEn) {

	public static UsuarioAdminResponse de(Usuario usuario, Instant ahora) {
		List<String> roles = usuario.getRoles().stream().map(Rol::getNombre).sorted().toList();
		return new UsuarioAdminResponse(usuario.getId(), usuario.getCorreo(), usuario.getNombre(), usuario.isActivo(),
				usuario.estaBloqueado(ahora), roles, usuario.getCreadoEn(), usuario.getActualizadoEn());
	}

}
