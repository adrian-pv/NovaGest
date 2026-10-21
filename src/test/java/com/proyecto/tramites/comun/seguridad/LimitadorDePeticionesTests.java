package com.proyecto.tramites.comun.seguridad;

import static org.assertj.core.api.Assertions.assertThat;

import com.proyecto.tramites.comun.config.LimiteProperties.Regla;
import com.proyecto.tramites.comun.seguridad.LimitadorDePeticiones.Resultado;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Tarjeta 27: la logica del limitador, con un reloj controlable (sin esperar tiempo real). */
class LimitadorDePeticionesTests {

	private static final Regla TRES_POR_MINUTO = new Regla(3, Duration.ofMinutes(1));

	private RelojManual reloj;

	private LimitadorDePeticiones limitador;

	@BeforeEach
	void preparar() {
		reloj = new RelojManual();
		limitador = new LimitadorDePeticiones(reloj);
	}

	private boolean permite(String operacion, String clave) {
		return limitador.intentar(operacion, clave, TRES_POR_MINUTO).permitida();
	}

	@Test
	void permiteHastaElMaximoYRechazaLaSiguiente() {
		assertThat(permite("login", "1.1.1.1")).isTrue();
		assertThat(permite("login", "1.1.1.1")).isTrue();
		assertThat(permite("login", "1.1.1.1")).isTrue();

		assertThat(permite("login", "1.1.1.1")).isFalse();
		assertThat(permite("login", "1.1.1.1")).isFalse();
	}

	@Test
	void indicaCuantoFaltaRedondeandoHaciaArriba() {
		limitador.intentar("login", "1.1.1.1", TRES_POR_MINUTO);
		limitador.intentar("login", "1.1.1.1", TRES_POR_MINUTO);
		limitador.intentar("login", "1.1.1.1", TRES_POR_MINUTO);
		reloj.avanzar(Duration.ofMillis(10_200));

		Resultado resultado = limitador.intentar("login", "1.1.1.1", TRES_POR_MINUTO);

		assertThat(resultado.permitida()).isFalse();
		assertThat(resultado.reintentarEnSegundos()).isEqualTo(50); // faltan 49,8 s
	}

	@Test
	void nuncaIndicaCeroSegundos() {
		for (int i = 0; i < 3; i++) {
			limitador.intentar("login", "1.1.1.1", TRES_POR_MINUTO);
		}
		reloj.avanzar(Duration.ofMillis(59_999));

		assertThat(limitador.intentar("login", "1.1.1.1", TRES_POR_MINUTO).reintentarEnSegundos()).isEqualTo(1);
	}

	@Test
	void alTerminarLaVentanaElContadorVuelveACero() {
		for (int i = 0; i < 4; i++) {
			permite("login", "1.1.1.1");
		}
		assertThat(permite("login", "1.1.1.1")).isFalse();

		reloj.avanzar(Duration.ofMinutes(1));

		assertThat(permite("login", "1.1.1.1")).isTrue();
		assertThat(permite("login", "1.1.1.1")).isTrue();
		assertThat(permite("login", "1.1.1.1")).isTrue();
		assertThat(permite("login", "1.1.1.1")).isFalse();
	}

	@Test
	void unSegundoAntesDeTerminarSigueRechazando() {
		for (int i = 0; i < 3; i++) {
			permite("login", "1.1.1.1");
		}

		reloj.avanzar(Duration.ofSeconds(59));

		assertThat(permite("login", "1.1.1.1")).isFalse();
	}

	@Test
	void lasPeticionesRechazadasNoAlarganLaVentana() {
		for (int i = 0; i < 3; i++) {
			permite("login", "1.1.1.1");
		}
		// Insistir durante la ventana no debe castigar mas: a los 60 s desde la primera se puede volver a intentar
		reloj.avanzar(Duration.ofSeconds(30));
		assertThat(permite("login", "1.1.1.1")).isFalse();
		reloj.avanzar(Duration.ofSeconds(29));
		assertThat(permite("login", "1.1.1.1")).isFalse();
		reloj.avanzar(Duration.ofSeconds(1));

		assertThat(permite("login", "1.1.1.1")).isTrue();
	}

	@Test
	void cadaDireccionTieneSuPropioContador() {
		for (int i = 0; i < 4; i++) {
			permite("login", "1.1.1.1");
		}

		assertThat(permite("login", "1.1.1.1")).isFalse();
		assertThat(permite("login", "2.2.2.2")).isTrue();
	}

	@Test
	void cadaOperacionTieneSuPropioContador() {
		for (int i = 0; i < 4; i++) {
			permite("login", "1.1.1.1");
		}

		assertThat(permite("login", "1.1.1.1")).isFalse();
		assertThat(permite("registro", "1.1.1.1")).isTrue();
	}

	@Test
	void cadaReglaUsaSuPropioMaximoYVentana() {
		Regla una = new Regla(1, Duration.ofHours(1));

		assertThat(limitador.intentar("registro", "1.1.1.1", una).permitida()).isTrue();
		Resultado segunda = limitador.intentar("registro", "1.1.1.1", una);

		assertThat(segunda.permitida()).isFalse();
		assertThat(segunda.reintentarEnSegundos()).isEqualTo(3600);
	}

	@Test
	void laMemoriaEstaAcotadaPorUnLimiteDeEntradas() {
		LimitadorDePeticiones acotado = new LimitadorDePeticiones(reloj, 3);

		for (int i = 0; i < 100; i++) {
			acotado.intentar("login", "10.0.0." + i, TRES_POR_MINUTO);
		}

		assertThat(acotado.entradas()).isEqualTo(3);
	}

	@Test
	void alSuperarElLimiteSeDescartanLosMenosUsadosRecientemente() {
		LimitadorDePeticiones acotado = new LimitadorDePeticiones(reloj, 3);
		for (int i = 0; i < 3; i++) {
			acotado.intentar("login", "1.1.1.1", TRES_POR_MINUTO);
		}
		assertThat(acotado.intentar("login", "1.1.1.1", TRES_POR_MINUTO).permitida()).isFalse();

		// Otras tres direcciones desplazan a la primera: pierde su contador (fail-open parcial, documentado)
		acotado.intentar("login", "2.2.2.2", TRES_POR_MINUTO);
		acotado.intentar("login", "3.3.3.3", TRES_POR_MINUTO);
		acotado.intentar("login", "4.4.4.4", TRES_POR_MINUTO);

		assertThat(acotado.intentar("login", "1.1.1.1", TRES_POR_MINUTO).permitida()).isTrue();
	}

	@Test
	void unaDireccionQueSigueActivaNoSeDescartaAntesQueLasInactivas() {
		LimitadorDePeticiones acotado = new LimitadorDePeticiones(reloj, 3);
		for (int i = 0; i < 3; i++) {
			acotado.intentar("login", "1.1.1.1", TRES_POR_MINUTO);
		}
		acotado.intentar("login", "2.2.2.2", TRES_POR_MINUTO);
		acotado.intentar("login", "3.3.3.3", TRES_POR_MINUTO);
		// 1.1.1.1 insiste: su entrada se renueva y la mas antigua pasa a ser otra
		acotado.intentar("login", "1.1.1.1", TRES_POR_MINUTO);
		acotado.intentar("login", "4.4.4.4", TRES_POR_MINUTO);

		assertThat(acotado.intentar("login", "1.1.1.1", TRES_POR_MINUTO).permitida()).isFalse();
	}

	@Test
	void conMuchosHilosALaVezPermiteExactamenteElMaximo() throws Exception {
		Regla cincuenta = new Regla(50, Duration.ofMinutes(1));
		int hilos = 200;
		ExecutorService pool = Executors.newFixedThreadPool(32);
		CountDownLatch salida = new CountDownLatch(1);
		AtomicInteger permitidas = new AtomicInteger();
		List<Future<?>> tareas = new ArrayList<>();
		try {
			for (int i = 0; i < hilos; i++) {
				tareas.add(pool.submit(() -> {
					salida.await();
					if (limitador.intentar("login", "9.9.9.9", cincuenta).permitida()) {
						permitidas.incrementAndGet();
					}
					return null;
				}));
			}
			salida.countDown();
			for (Future<?> tarea : tareas) {
				tarea.get(10, TimeUnit.SECONDS);
			}
		}
		finally {
			pool.shutdownNow();
		}

		assertThat(permitidas.get()).isEqualTo(50);
	}

}
