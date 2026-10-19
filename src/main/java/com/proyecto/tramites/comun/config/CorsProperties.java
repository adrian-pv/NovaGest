package com.proyecto.tramites.comun.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Origenes del navegador autorizados a llamar a la API (variable CORS_ORIGINS, separados por coma).
 * Vacio por defecto: sin origenes no se acepta ninguna llamada entre origenes, que es lo correcto cuando el
 * frontend se publica en el mismo origen que la API (Nginx) o cuando no hay frontend.
 */
@ConfigurationProperties(prefix = "app.cors")
public record CorsProperties(List<String> origenesPermitidos) {

	public CorsProperties {
		origenesPermitidos = origenesPermitidos == null ? List.of()
				: origenesPermitidos.stream().map(String::trim).filter(o -> !o.isEmpty()).toList();
	}

}
