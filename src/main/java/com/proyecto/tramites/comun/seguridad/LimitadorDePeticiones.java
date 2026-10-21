package com.proyecto.tramites.comun.seguridad;

import com.proyecto.tramites.comun.config.LimiteProperties.Regla;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Cuenta peticiones por (operacion, direccion) en ventanas fijas. Cada ventana empieza con la primera peticion y dura
 * lo que dice la regla; al terminar, el contador vuelve a cero. Las peticiones rechazadas NO alargan la ventana: quien
 * espera lo que indica Retry-After puede volver a intentar.
 * <p>
 * La memoria esta acotada: se guardan como maximo {@code maximoDeEntradas} contadores y, al llegar al limite, se
 * descartan los menos usados recientemente. Un ataque con millones de direcciones distintas puede hacer que se pierda
 * el contador de una direccion (fail-open parcial), pero nunca agota la memoria del servidor.
 * <p>
 * Es un contador en memoria de este proceso: con varias instancias del backend cada una cuenta por su lado. Para el
 * despliegue actual (una instancia) basta; con varias habria que moverlo a Nginx o a un almacen compartido.
 */
@Component
public class LimitadorDePeticiones {

	private static final Logger LOG = LoggerFactory.getLogger(LimitadorDePeticiones.class);

	static final int MAXIMO_POR_DEFECTO = 50_000;

	/** Resultado de intentar una peticion. {@code reintentarEnSegundos} solo tiene sentido si no se permite. */
	public record Resultado(boolean permitida, long reintentarEnSegundos) {
	}

	private record Ventana(Instant inicio, int cuenta, boolean avisada) {
	}

	private final Clock reloj;

	private final ReentrantLock cerrojo = new ReentrantLock();

	private final Map<String, Ventana> ventanas;

	@Autowired
	public LimitadorDePeticiones(Clock reloj) {
		this(reloj, MAXIMO_POR_DEFECTO);
	}

	LimitadorDePeticiones(Clock reloj, int maximoDeEntradas) {
		this.reloj = reloj;
		this.ventanas = new LinkedHashMap<>(16, 0.75f, true) {
			@Override
			protected boolean removeEldestEntry(Map.Entry<String, Ventana> masAntigua) {
				return size() > maximoDeEntradas;
			}
		};
	}

	/**
	 * Registra una peticion de {@code clave} (normalmente una IP) en la operacion {@code operacion} y dice si se
	 * permite. Es seguro llamarlo desde varios hilos a la vez.
	 */
	public Resultado intentar(String operacion, String clave, Regla regla) {
		Instant ahora = reloj.instant();
		String llave = operacion + '|' + clave;
		cerrojo.lock();
		try {
			Ventana actual = ventanas.get(llave);
			if (actual == null || !ahora.isBefore(actual.inicio().plus(regla.ventana()))) {
				actual = new Ventana(ahora, 0, false);
			}
			if (actual.cuenta() >= regla.max()) {
				// Se avisa en el registro una sola vez por ventana, para no llenarlo durante un ataque
				if (!actual.avisada()) {
					LOG.warn("Limite de peticiones excedido en {} desde {}", operacion, clave);
					actual = new Ventana(actual.inicio(), actual.cuenta(), true);
				}
				ventanas.put(llave, actual);
				return new Resultado(false, segundosRestantes(ahora, actual.inicio().plus(regla.ventana())));
			}
			ventanas.put(llave, new Ventana(actual.inicio(), actual.cuenta() + 1, actual.avisada()));
			return new Resultado(true, 0);
		}
		finally {
			cerrojo.unlock();
		}
	}

	/** Segundos que faltan, redondeados hacia arriba y nunca menos de 1 (Retry-After: 0 invitaria a reintentar ya). */
	private static long segundosRestantes(Instant ahora, Instant fin) {
		long milis = Duration.between(ahora, fin).toMillis();
		return Math.max(1, (milis + 999) / 1000);
	}

	/** Cuantos contadores se guardan ahora mismo (para pruebas). */
	int entradas() {
		cerrojo.lock();
		try {
			return ventanas.size();
		}
		finally {
			cerrojo.unlock();
		}
	}

}
