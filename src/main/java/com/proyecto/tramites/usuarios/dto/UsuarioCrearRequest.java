package com.proyecto.tramites.usuarios.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Tarjeta 12: el administrador crea un usuario con uno o varios roles (por nombre, por ejemplo GESTOR).
 * La clave admite hasta 72 caracteres, el limite de BCrypt.
 */
public record UsuarioCrearRequest(
		@NotBlank @Size(max = 120) String nombre,
		@NotBlank @Email @Size(max = 254) String correo,
		@NotBlank @Size(min = 8, max = 72) String clave,
		@NotEmpty @Size(max = 10) List<@NotBlank String> roles) {

	/** La clave nunca debe salir en un log, ni por accidente. */
	@Override
	public String toString() {
		return "UsuarioCrearRequest[correo=" + correo + ", roles=" + roles + ", clave=***]";
	}

}
