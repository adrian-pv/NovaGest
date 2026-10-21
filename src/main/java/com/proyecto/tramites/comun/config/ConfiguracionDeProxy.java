package com.proyecto.tramites.comun.config;

import java.util.List;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Tarjeta 45: la API detras de un proxy (Nginx) necesita ver la direccion, el esquema (http/https) y el host
 * ORIGINALES de quien llama. Sin eso: la bitacora registra la IP del proxy, el limite de peticiones (tarjeta 27) cuenta
 * a todos los usuarios como uno solo, HSTS (tarjeta 26) nunca se envia y los POST del navegador reciben 403 por CORS.
 * <p>
 * La solucion es el manejo nativo de Tomcat ({@code server.forward-headers-strategy=native}), que reemplaza esos
 * valores leyendo X-Forwarded-For, X-Forwarded-Proto y X-Forwarded-Host, pero SOLO si la peticion llega desde un proxy
 * de confianza ({@code server.tomcat.remoteip.internal-proxies}, una expresion regular de direcciones). Desde
 * cualquier otro origen esas cabeceras se ignoran, porque cualquiera puede inventarlas.
 * <p>
 * Este componente hace que la aplicacion se NIEGUE A ARRANCAR con una configuracion peligrosa:
 * <ul>
 * <li>{@code framework} (ForwardedHeaderFilter) confia en cualquier origen: prohibido.</li>
 * <li>{@code native} sin proxies de confianza, o con una expresion que acepta direcciones publicas cualesquiera
 * (por ejemplo ".*"), equivale a no tener control: prohibido.</li>
 * </ul>
 * Por defecto ({@code none}) las cabeceras reenviadas se ignoran: es lo correcto en desarrollo y sin proxy.
 */
@Component
public class ConfiguracionDeProxy {

	private static final Logger LOG = LoggerFactory.getLogger(ConfiguracionDeProxy.class);

	/** Direcciones publicas de ejemplo: una expresion de proxies de confianza jamas deberia aceptarlas. */
	private static final List<String> DIRECCIONES_PUBLICAS = List.of("8.8.8.8", "1.1.1.1", "203.0.113.1",
			"198.51.100.7", "2001:db8::1");

	public ConfiguracionDeProxy(@Value("${server.forward-headers-strategy:none}") String estrategia,
			@Value("${server.tomcat.remoteip.internal-proxies:}") String proxies) {
		validar(estrategia, proxies);
		if ("native".equals(normalizar(estrategia))) {
			LOG.info("Cabeceras reenviadas aceptadas solo desde los proxies de confianza configurados");
		}
		else {
			LOG.info("Cabeceras reenviadas (X-Forwarded-*) ignoradas: la API no esta detras de un proxy configurado");
		}
	}

	static void validar(String estrategiaCruda, String proxies) {
		String estrategia = normalizar(estrategiaCruda);
		switch (estrategia) {
			case "none" -> {
				// Sin proxy: se ignoran las cabeceras, no hay nada mas que comprobar
			}
			case "native" -> validarProxies(proxies);
			case "framework" -> throw new IllegalStateException("FORWARD_HEADERS=framework esta prohibido: confia en "
					+ "las cabeceras X-Forwarded-* de cualquier origen y permite falsificar la IP. Usa native");
			default -> throw new IllegalStateException("FORWARD_HEADERS tiene un valor no valido: debe ser none o native");
		}
	}

	private static void validarProxies(String proxies) {
		if (proxies == null || proxies.isBlank()) {
			throw new IllegalStateException("FORWARD_HEADERS=native exige PROXIES_CONFIANZA: la expresion regular de las "
					+ "direcciones del proxy (por ejemplo 127\\.0\\.0\\.1). Sin ella no se sabe de quien fiarse");
		}
		Pattern patron;
		try {
			patron = Pattern.compile(proxies);
		}
		catch (PatternSyntaxException e) {
			throw new IllegalStateException("PROXIES_CONFIANZA no es una expresion regular valida");
		}
		for (String direccion : DIRECCIONES_PUBLICAS) {
			if (patron.matcher(direccion).matches()) {
				throw new IllegalStateException("PROXIES_CONFIANZA es demasiado amplia: acepta direcciones publicas "
						+ "cualesquiera (como " + direccion + "). Debe limitarse a las direcciones de tu proxy");
			}
		}
	}

	private static String normalizar(String estrategia) {
		return estrategia == null || estrategia.isBlank() ? "none" : estrategia.trim().toLowerCase(java.util.Locale.ROOT);
	}

}
