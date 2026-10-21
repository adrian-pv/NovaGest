package com.proyecto.tramites.comun.seguridad;

import com.proyecto.tramites.comun.config.LimiteProperties;
import com.proyecto.tramites.comun.config.LimiteProperties.Regla;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpMethod;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Tarjeta 27: responde 429 cuando una direccion IP repite demasiado el login, el registro o la renovacion de tokens.
 * Corre en la cadena de seguridad, despues de CORS (para que el navegador pueda leer el 429) y antes de autenticar,
 * asi una peticion rechazada no gasta tiempo en BCrypt ni toca la base de datos ni suma fallos a ninguna cuenta.
 * <p>
 * La direccion es {@code request.getRemoteAddr()}. NO se leen cabeceras como X-Forwarded-For: cualquiera puede
 * inventarlas y saltarse el limite. Detras de un proxy de confianza hay que configurar el manejo de cabeceras
 * reenviadas (tarjeta 45); sin eso, todos los usuarios compartirian la direccion del proxy y el limite los afectaria
 * a todos a la vez.
 */
public class FiltroLimitePeticiones extends OncePerRequestFilter {

	private final LimitadorDePeticiones limitador;

	private final LimiteProperties propiedades;

	private final RequestMatcher login;

	private final RequestMatcher registro;

	private final RequestMatcher refresh;

	public FiltroLimitePeticiones(LimitadorDePeticiones limitador, LimiteProperties propiedades) {
		this.limitador = limitador;
		this.propiedades = propiedades;
		PathPatternRequestMatcher.Builder rutas = PathPatternRequestMatcher.withDefaults();
		this.login = rutas.matcher(HttpMethod.POST, "/api/auth/login");
		this.registro = rutas.matcher(HttpMethod.POST, "/api/auth/registro");
		this.refresh = rutas.matcher(HttpMethod.POST, "/api/auth/refresh");
	}

	@Override
	protected void doFilterInternal(HttpServletRequest peticion, HttpServletResponse respuesta, FilterChain cadena)
			throws ServletException, IOException {
		if (propiedades.habilitado()) {
			String operacion = operacionDe(peticion);
			if (operacion != null) {
				Regla regla = reglaDe(operacion);
				LimitadorDePeticiones.Resultado resultado = limitador.intentar(operacion, peticion.getRemoteAddr(),
						regla);
				if (!resultado.permitida()) {
					rechazar(respuesta, resultado.reintentarEnSegundos());
					return;
				}
			}
		}
		cadena.doFilter(peticion, respuesta);
	}

	private String operacionDe(HttpServletRequest peticion) {
		if (login.matches(peticion)) {
			return "login";
		}
		if (registro.matches(peticion)) {
			return "registro";
		}
		if (refresh.matches(peticion)) {
			return "refresh";
		}
		return null;
	}

	private Regla reglaDe(String operacion) {
		return switch (operacion) {
			case "login" -> propiedades.login();
			case "registro" -> propiedades.registro();
			default -> propiedades.refresh();
		};
	}

	/** 429 con Problem Details y Retry-After. No dice cuantas peticiones llevaba ni de que direccion. */
	private static void rechazar(HttpServletResponse respuesta, long segundos) throws IOException {
		respuesta.setStatus(429);
		respuesta.setHeader("Retry-After", String.valueOf(segundos));
		respuesta.setContentType("application/problem+json");
		respuesta.setCharacterEncoding("UTF-8");
		respuesta.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Demasiados intentos\",\"status\":429,"
				+ "\"detail\":\"Demasiadas solicitudes desde esta direccion. Intenta de nuevo en " + segundos
				+ " segundos.\"}");
	}

}
