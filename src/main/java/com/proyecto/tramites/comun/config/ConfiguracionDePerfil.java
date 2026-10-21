package com.proyecto.tramites.comun.config;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;

/**
 * Tarjeta 46: la aplicacion se NIEGA A ARRANCAR si el perfil no es explicito o si produccion tiene una clave de
 * tokens debil. Antes el perfil por defecto era {@code dev}: olvidar {@code SPRING_PROFILES_ACTIVE=prod} en un servidor
 * lo dejaba con Swagger y con usuarios de demostracion. Ahora no hay perfil por defecto y el error dice que hacer.
 * <ul>
 * <li>Sin ninguno de dev, test o prod: no arranca.</li>
 * <li>{@code prod} junto a {@code dev} o {@code test}: no arranca (mezclaria la configuracion segura con la de desarrollo).</li>
 * <li>{@code prod} con JWT_SECRET corta, repetitiva o de ejemplo: no arranca.</li>
 * </ul>
 * La longitud minima de la clave se exige en todos los perfiles (SecurityConfig); aqui se agrega la exigencia extra de prod.
 * <p>
 * Es un {@link EnvironmentPostProcessor} (registrado en META-INF/spring.factories) y no un bean: asi corre ANTES de crear
 * cualquier bean, y el mensaje claro sale antes que un error de base de datos o de Flyway. Va despues de la carga de
 * application.properties y del archivo .env, por eso ve los mismos valores que vera la aplicacion.
 */
public class ConfiguracionDePerfil implements EnvironmentPostProcessor, Ordered {

	private static final List<String> PERFILES = List.of("dev", "test", "prod");

	private static final int MINIMO_CARACTERES_PROD = 32;

	private static final int MINIMO_DISTINTOS_PROD = 12;

	/** Fragmentos tipicos de claves de ejemplo copiadas de una guia o de un .env.example. */
	private static final List<String> CLAVES_DE_EJEMPLO = List.of("changeme", "cambiame", "cambiar", "secret", "password",
			"clave-solo-para-pruebas", "ejemplo", "example", "123456", "qwerty");

	@Override
	public void postProcessEnvironment(ConfigurableEnvironment entorno, SpringApplication aplicacion) {
		validar(Arrays.asList(entorno.getActiveProfiles()), claveJwt(entorno));
	}

	/** Si JWT_SECRET no existe, application.properties no se puede resolver: se trata como clave ausente. */
	private static String claveJwt(ConfigurableEnvironment entorno) {
		try {
			return entorno.getProperty("app.jwt.secret", "");
		}
		catch (IllegalArgumentException e) {
			return "";
		}
	}

	@Override
	public int getOrder() {
		return Ordered.LOWEST_PRECEDENCE;
	}

	static void validar(List<String> activos, String claveJwt) {
		List<String> conocidos = activos.stream().map(p -> p.trim().toLowerCase(Locale.ROOT)).filter(PERFILES::contains)
				.collect(Collectors.toList());
		if (conocidos.isEmpty()) {
			throw new IllegalStateException("No hay perfil activo. Define SPRING_PROFILES_ACTIVE=dev (desarrollo) o "
					+ "SPRING_PROFILES_ACTIVE=prod (servidor). No hay perfil por defecto a proposito: asi un servidor al "
					+ "que se le olvida la variable no arranca con Swagger ni datos de demostracion");
		}
		if (conocidos.contains("prod")) {
			if (conocidos.size() > 1) {
				throw new IllegalStateException("El perfil prod no se combina con dev ni test: mezclaria la configuracion "
						+ "segura con la de desarrollo (Swagger, datos de demostracion)");
			}
			validarClaveDeProduccion(claveJwt);
		}
	}

	private static void validarClaveDeProduccion(String clave) {
		if (clave == null || clave.isBlank()) {
			throw new IllegalStateException("En prod JWT_SECRET es obligatoria: una clave larga y aleatoria "
					+ "(por ejemplo, la salida de: openssl rand -base64 48)");
		}
		if (clave.length() < MINIMO_CARACTERES_PROD) {
			throw new IllegalStateException("En prod JWT_SECRET es demasiado corta: necesita al menos "
					+ MINIMO_CARACTERES_PROD + " caracteres (openssl rand -base64 48)");
		}
		if (clave.chars().distinct().count() < MINIMO_DISTINTOS_PROD) {
			throw new IllegalStateException("En prod JWT_SECRET es demasiado repetitiva para ser aleatoria "
					+ "(openssl rand -base64 48)");
		}
		String minusculas = clave.toLowerCase(Locale.ROOT);
		if (CLAVES_DE_EJEMPLO.stream().anyMatch(minusculas::contains)) {
			throw new IllegalStateException("En prod JWT_SECRET parece una clave de ejemplo: genera una propia "
					+ "(openssl rand -base64 48)");
		}
	}

}
