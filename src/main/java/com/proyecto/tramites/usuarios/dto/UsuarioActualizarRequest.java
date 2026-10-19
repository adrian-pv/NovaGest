package com.proyecto.tramites.usuarios.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Tarjeta 12: el administrador cambia el nombre, activa o desactiva la cuenta y reemplaza sus roles.
 * El correo y la clave no se cambian aqui.
 */
public record UsuarioActualizarRequest(
		@NotBlank @Size(max = 120) String nombre,
		@NotNull Boolean activo,
		@NotEmpty @Size(max = 10) List<@NotBlank String> roles) {

}
