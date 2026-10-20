package com.proyecto.tramites.comun.config;

import java.time.Duration;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Tarjeta 25: CORS cerrado salvo los origenes listados en app.cors.origenes-permitidos. Nunca se acepta un comodin:
 * la API usa tokens en la cabecera Authorization y un origen ajeno no debe poder leer sus respuestas.
 * No se permiten credenciales (cookies): la sesion viaja solo en el token.
 */
@Configuration
@EnableConfigurationProperties(CorsProperties.class)
public class CorsConfig {

	/** Esquema, servidor y puerto opcional: sin comodines, sin ruta y sin barra final. */
	private static final Pattern ORIGEN_VALIDO = Pattern.compile("^https?://[A-Za-z0-9.-]+(:\\d{1,5})?$");

	@Bean
	public CorsConfigurationSource corsConfigurationSource(CorsProperties propiedades) {
		propiedades.origenesPermitidos().forEach(CorsConfig::validar);
		CorsConfiguration configuracion = new CorsConfiguration();
		configuracion.setAllowedOrigins(propiedades.origenesPermitidos());
		configuracion.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
		configuracion.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
		// Cabeceras que el frontend necesita leer: descarga de comprobantes y limite de peticiones
		configuracion.setExposedHeaders(List.of("Content-Disposition", "Retry-After"));
		configuracion.setAllowCredentials(false);
		configuracion.setMaxAge(Duration.ofHours(1));
		UrlBasedCorsConfigurationSource fuente = new UrlBasedCorsConfigurationSource();
		fuente.registerCorsConfiguration("/**", configuracion);
		return fuente;
	}

	static void validar(String origen) {
		if (!ORIGEN_VALIDO.matcher(origen).matches()) {
			throw new IllegalStateException("CORS_ORIGINS tiene un origen no valido: debe ser http(s)://servidor[:puerto], "
					+ "sin comodines, sin ruta y sin barra final");
		}
	}

}
