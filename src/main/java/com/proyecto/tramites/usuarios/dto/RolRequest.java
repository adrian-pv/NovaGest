package com.proyecto.tramites.usuarios.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Tarjeta 12: datos para crear o reemplazar un rol. El nombre va en mayusculas (por ejemplo CAJERO).
 * permisos es la lista completa con el formato recurso:accion (por ejemplo pago:leer); al editar, reemplaza
 * a la anterior. alcanceTotal indica si el rol ve los registros de todos (true) o solo los propios (false).
 */
public record RolRequest(
		@NotBlank @Pattern(regexp = "^[A-Z][A-Z0-9_]{2,49}$",
				message = "Solo mayusculas, numeros y guion bajo; de 3 a 50 caracteres") String nombre,
		@Size(max = 255) String descripcion,
		@NotNull Boolean alcanceTotal,
		@NotNull @Size(max = 100) List<@NotBlank String> permisos) {

}
