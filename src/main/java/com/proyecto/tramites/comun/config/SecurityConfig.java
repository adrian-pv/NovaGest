package com.proyecto.tramites.comun.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.proyecto.tramites.auth.service.JwtAutenticacionConverter;
import com.proyecto.tramites.comun.excepcion.ProblemaSeguridad;
import com.proyecto.tramites.comun.seguridad.FiltroLimitePeticiones;
import com.proyecto.tramites.comun.seguridad.LimitadorDePeticiones;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.filter.CorsFilter;

/**
 * Seguridad de la API. Denegar por defecto: solo registro, login, salud y la documentacion son publicos; todo lo demas
 * exige un token de acceso valido. Sin token valido responde 401; con token pero sin permiso, 403.
 * Los permisos por endpoint se declaran con @PreAuthorize (habilitado por @EnableMethodSecurity).
 */
@Configuration
@EnableMethodSecurity
@EnableConfigurationProperties({ JwtProperties.class, LoginProperties.class, SeguridadProperties.class,
		LimiteProperties.class })
public class SecurityConfig {

	private static final int MINIMO_BYTES_CLAVE = 32;

	@Bean
	PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}

	/** Reloj inyectable: permite probar vencimientos y bloqueos sin esperar. */
	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}

	@Bean
	SecretKey jwtKey(JwtProperties propiedades) {
		byte[] bytes = propiedades.secret() == null ? new byte[0] : propiedades.secret().getBytes(StandardCharsets.UTF_8);
		if (bytes.length < MINIMO_BYTES_CLAVE) {
			throw new IllegalStateException("JWT_SECRET debe tener al menos 32 caracteres (256 bits)");
		}
		return new SecretKeySpec(bytes, "HmacSHA256");
	}

	@Bean
	JwtEncoder jwtEncoder(SecretKey jwtKey) {
		return new NimbusJwtEncoder(new ImmutableSecret<>(jwtKey));
	}

	/** Valida firma (solo HS256 con nuestra clave) y vencimiento de cada token que llega. */
	@Bean
	JwtDecoder jwtDecoder(SecretKey jwtKey) {
		return NimbusJwtDecoder.withSecretKey(jwtKey).macAlgorithm(MacAlgorithm.HS256).build();
	}

	/** Evita que Spring cree un usuario de arranque con clave aleatoria. Los usuarios reales salen de la base. */
	@Bean
	UserDetailsService sinUsuariosPorDefecto() {
		return correo -> {
			throw new UsernameNotFoundException("Los usuarios se autentican por AuthService");
		};
	}

	@Bean
	SecurityFilterChain filterChain(HttpSecurity http, JwtAutenticacionConverter conversor,
			ProblemaSeguridad problemas, SeguridadProperties seguridad, LimiteProperties limite,
			LimitadorDePeticiones limitador) throws Exception {
		http
				.csrf(csrf -> csrf.disable())
				// Tarjeta 26: cabeceras de seguridad en todas las respuestas, tambien en las de error
				.headers(cabeceras -> CabecerasSeguridad.aplicar(cabeceras, seguridad))
				// Tarjeta 25: usa el bean corsConfigurationSource (CorsConfig); responde el preflight antes de autenticar
				.cors(Customizer.withDefaults())
				// Tarjeta 27: limite de peticiones por IP en login, registro y refresh. Despues de CORS (el navegador
				// puede leer el 429) y antes de autenticar. No es un bean: asi Spring Boot no lo registra dos veces.
				.addFilterAfter(new FiltroLimitePeticiones(limitador, limite), CorsFilter.class)
				.sessionManagement(sesion -> sesion.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.httpBasic(basic -> basic.disable())
				.formLogin(form -> form.disable())
				.authorizeHttpRequests(rutas -> rutas
						.requestMatchers(HttpMethod.POST, "/api/auth/registro", "/api/auth/login", "/api/auth/refresh")
						.permitAll()
						.requestMatchers("/actuator/health").permitAll()
						// Tarjeta 5: documentacion publica para la demostracion (en prod se apaga con springdoc.*)
						.requestMatchers(HttpMethod.GET, "/v3/api-docs", "/v3/api-docs/**", "/swagger-ui.html",
								"/swagger-ui/**").permitAll()
						.anyRequest().authenticated())
				.exceptionHandling(errores -> errores
						.authenticationEntryPoint(problemas)
						.accessDeniedHandler(problemas))
				.oauth2ResourceServer(recurso -> recurso
						.authenticationEntryPoint(problemas)
						.accessDeniedHandler(problemas)
						.jwt(jwt -> jwt.jwtAuthenticationConverter(conversor)));
		return http.build();
	}

}
