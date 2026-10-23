package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.proyecto.tramites.comun.util.BloqueoDeTarea;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * Dos instancias sobre la misma base: la tarea programada la corre solo una. Aqui las "instancias" son dos hilos con su
 * propia conexion a la misma base, que es lo que ve PostgreSQL. No usa @Transactional: el candado es de sesion.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles("test")
class BloqueoDeTareaTests {

	private static final long CLAVE = 987_654_321L;

	@Autowired
	private BloqueoDeTarea bloqueo;

	@Test
	void mientrasUnaInstanciaCorreLaTareaLaOtraLaOmiteSinEsperar() throws Exception {
		CountDownLatch dentro = new CountDownLatch(1);
		CountDownLatch soltar = new CountDownLatch(1);
		AtomicInteger ejecuciones = new AtomicInteger();

		CompletableFuture<Boolean> primera = CompletableFuture.supplyAsync(() -> bloqueo.ejecutarSiLibre(CLAVE, () -> {
			ejecuciones.incrementAndGet();
			dentro.countDown();
			esperar(soltar);
		}));
		assertThat(dentro.await(10, TimeUnit.SECONDS)).isTrue();

		boolean segunda = bloqueo.ejecutarSiLibre(CLAVE, ejecuciones::incrementAndGet);

		assertThat(segunda).isFalse();
		assertThat(ejecuciones).hasValue(1);
		soltar.countDown();
		assertThat(primera.get(10, TimeUnit.SECONDS)).isTrue();
	}

	@Test
	void alTerminarLaTareaElCandadoQuedaLibre() {
		AtomicInteger ejecuciones = new AtomicInteger();

		assertThat(bloqueo.ejecutarSiLibre(CLAVE, ejecuciones::incrementAndGet)).isTrue();
		assertThat(bloqueo.ejecutarSiLibre(CLAVE, ejecuciones::incrementAndGet)).isTrue();

		assertThat(ejecuciones).hasValue(2);
	}

	@Test
	void siLaTareaFallaElCandadoSeSueltaIgual() {
		assertThatThrownBy(() -> bloqueo.ejecutarSiLibre(CLAVE, () -> {
			throw new IllegalStateException("fallo de prueba");
		})).isInstanceOf(IllegalStateException.class);

		assertThat(bloqueo.ejecutarSiLibre(CLAVE, () -> { })).isTrue();
	}

	@Test
	void tareasConOtraClaveNoSeBloqueanEntreSi() throws Exception {
		CountDownLatch dentro = new CountDownLatch(1);
		CountDownLatch soltar = new CountDownLatch(1);
		CompletableFuture<Boolean> primera = CompletableFuture.supplyAsync(() -> bloqueo.ejecutarSiLibre(CLAVE, () -> {
			dentro.countDown();
			esperar(soltar);
		}));
		assertThat(dentro.await(10, TimeUnit.SECONDS)).isTrue();

		assertThat(bloqueo.ejecutarSiLibre(CLAVE + 1, () -> { })).isTrue();

		soltar.countDown();
		assertThat(primera.get(10, TimeUnit.SECONDS)).isTrue();
	}

	private static void esperar(CountDownLatch cerrojo) {
		try {
			cerrojo.await(10, TimeUnit.SECONDS);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}

}
