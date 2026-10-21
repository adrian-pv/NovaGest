package com.proyecto.tramites.comun.config;

import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.web.header.writers.DelegatingRequestMatcherHeaderWriter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.header.writers.StaticHeadersWriter;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.NegatedRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * Tarjeta 26: cabeceras de seguridad de todas las respuestas, incluidas las de error (401, 403, 429).
 * <ul>
 * <li>nosniff: el navegador no adivina el tipo de un archivo (un comprobante nunca se ejecuta como pagina).</li>
 * <li>X-Frame-Options y frame-ancestors: ninguna pagina puede incrustar la API en un marco (clickjacking).</li>
 * <li>Referrer-Policy: no se envia la direccion de origen a otros sitios.</li>
 * <li>Content-Security-Policy: la API solo responde datos, asi que no carga nada (default-src 'none'). La
 * documentacion Swagger necesita sus propios scripts y estilos, por eso tiene una politica aparte, limitada a si
 * misma.</li>
 * <li>Permissions-Policy: apaga camara, microfono y ubicacion, que la API no usa.</li>
 * <li>Strict-Transport-Security: solo en respuestas HTTPS (ver SeguridadProperties).</li>
 * <li>Cache-Control: no-store (valor por defecto de Spring Security): las respuestas con datos personales no se
 * guardan en cache del navegador ni de un proxy.</li>
 * </ul>
 */
final class CabecerasSeguridad {

	static final String CSP_API = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

	static final String CSP_DOCUMENTACION = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
			+ "base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

	static final String PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

	private CabecerasSeguridad() {
	}

	static void aplicar(HeadersConfigurer<HttpSecurity> cabeceras, SeguridadProperties propiedades) {
		PathPatternRequestMatcher.Builder rutas = PathPatternRequestMatcher.withDefaults();
		RequestMatcher documentacion = new OrRequestMatcher(rutas.matcher("/swagger-ui/**"),
				rutas.matcher("/swagger-ui.html"), rutas.matcher("/v3/api-docs"), rutas.matcher("/v3/api-docs/**"));

		cabeceras
				.contentTypeOptions(Customizer.withDefaults())
				.frameOptions(marco -> marco.deny())
				.referrerPolicy(referencia -> referencia.policy(ReferrerPolicy.NO_REFERRER))
				.addHeaderWriter(new StaticHeadersWriter("Permissions-Policy", PERMISSIONS_POLICY))
				.addHeaderWriter(new DelegatingRequestMatcherHeaderWriter(new NegatedRequestMatcher(documentacion),
						new StaticHeadersWriter("Content-Security-Policy", CSP_API)))
				.addHeaderWriter(new DelegatingRequestMatcherHeaderWriter(documentacion,
						new StaticHeadersWriter("Content-Security-Policy", CSP_DOCUMENTACION)));

		if (propiedades.hstsSegundos() > 0) {
			// Sin includeSubDomains ni preload: otros servicios del mismo dominio podrian no estar listos para HTTPS
			cabeceras.httpStrictTransportSecurity(
					hsts -> hsts.maxAgeInSeconds(propiedades.hstsSegundos()).includeSubDomains(false).preload(false));
		}
		else {
			cabeceras.httpStrictTransportSecurity(hsts -> hsts.disable());
		}
	}

}
