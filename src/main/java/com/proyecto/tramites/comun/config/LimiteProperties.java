package com.proyecto.tramites.comun.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Tarjeta 27: limite de peticiones por direccion IP en las operaciones publicas que un atacante podria repetir sin
 * parar: probar claves (login), crear cuentas en masa (registro) y adivinar tokens de renovacion (refresh). Complementa
 * el bloqueo por cuenta (5 fallos en 15 minutos), que no frena a quien prueba una clave en muchas cuentas distintas.
 * <p>
 * Cada regla permite {@code max} peticiones por {@code ventana}; la siguiente recibe 429 con Retry-After. Con
 * {@code habilitado=false} no se limita nada (solo para pruebas automaticas).
 */
@ConfigurationProperties(prefix = "app.limite")
public record LimiteProperties(boolean habilitado, Regla login, Regla registro, Regla refresh) {

	public LimiteProperties {
		if (login == null || registro == null || refresh == null) {
			throw new IllegalStateException("Faltan reglas en app.limite (login, registro y refresh)");
		}
	}

	/** Cuantas peticiones se permiten en cuanto tiempo. */
	public record Regla(int max, Duration ventana) {

		public Regla {
			if (max < 1) {
				throw new IllegalStateException("El maximo de peticiones de una regla debe ser al menos 1");
			}
			if (ventana == null || ventana.isZero() || ventana.isNegative()) {
				throw new IllegalStateException("La ventana de una regla debe ser positiva");
			}
		}

	}

}
