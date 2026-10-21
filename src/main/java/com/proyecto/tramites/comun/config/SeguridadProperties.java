package com.proyecto.tramites.comun.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Cabeceras de seguridad HTTP. hstsSegundos es cuanto tiempo recuerda el navegador que este sitio solo se usa por
 * HTTPS (31536000 = 1 ano); con 0 no se envia la cabecera. Solo se envia en respuestas HTTPS, asi que en desarrollo
 * (HTTP) no tiene efecto. Detras de un proxy requiere que el backend vea el esquema original (tarjeta 45).
 */
@ConfigurationProperties(prefix = "app.seguridad")
public record SeguridadProperties(long hstsSegundos) {

	public SeguridadProperties {
		if (hstsSegundos < 0) {
			throw new IllegalStateException("app.seguridad.hsts-segundos no puede ser negativo");
		}
	}

}
