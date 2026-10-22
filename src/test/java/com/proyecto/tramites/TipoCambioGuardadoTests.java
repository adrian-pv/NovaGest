package com.proyecto.tramites;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.proyecto.tramites.divisas.dto.Cotizacion;
import com.proyecto.tramites.divisas.dto.CotizacionMoneda;
import com.proyecto.tramites.divisas.dto.Moneda;
import com.proyecto.tramites.divisas.service.BanguatClient;
import com.proyecto.tramites.divisas.service.TipoCambioService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * Como se guardan los tipos de cambio que llegan del Banguat. El Banguat se reemplaza por un doble (nunca se llama al
 * servicio en vivo) y la base es propia de esta clase porque hay transacciones reales en paralelo.
 * <ul>
 * <li>Si la tarea diaria y una peticion piden la misma cotizacion a la vez, las dos deben terminar bien: antes la que
 * llegaba segunda chocaba con el indice unico y respondia 409 aunque la cotizacion ya estaba guardada.</li>
 * <li>Solo se guardan las filas del proveedor que son validas: una fila rota no debe guardarse ni, peor, hacer fallar la
 * consulta de todas las demas.</li>
 * </ul>
 */
@Import(BaseAislada.class)
@SpringBootTest
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class TipoCambioGuardadoTests {

	private static final LocalDate FECHA = LocalDate.of(2026, 10, 1);
	private static final int USD = Moneda.USD.codigoBanguat();

	@MockitoBean
	private BanguatClient banguat;

	@Autowired
	private TipoCambioService servicio;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private PlatformTransactionManager gestorTransacciones;

	private final ExecutorService hilos = Executors.newFixedThreadPool(4);

	private TransactionTemplate transaccion;

	@BeforeEach
	void limpiar() {
		transaccion = new TransactionTemplate(gestorTransacciones);
		jdbc.update("DELETE FROM tipo_cambio");
	}

	@AfterEach
	void cerrar() {
		hilos.shutdownNow();
	}

	private static CotizacionMoneda fila(int moneda, LocalDate fecha, String venta) {
		return new CotizacionMoneda(moneda, fecha, venta == null ? null : new BigDecimal(venta), new BigDecimal("7.00"));
	}

	private void elBanguatResponde(CotizacionMoneda... filas) {
		when(banguat.tipoCambioRango(any(), any())).thenReturn(List.of(filas));
	}

	private int filasGuardadas() {
		return jdbc.queryForObject("SELECT count(*) FROM tipo_cambio", Integer.class);
	}

	private void esperarUnaConsultaBloqueada() throws InterruptedException {
		long limite = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
		while (System.nanoTime() < limite) {
			Integer esperando = jdbc.queryForObject(
					"SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
					Integer.class);
			if (esperando != null && esperando > 0) {
				return;
			}
			Thread.sleep(25);
		}
		throw new AssertionError("Ninguna consulta quedo esperando el bloqueo del indice unico");
	}

	// ---------- Guardado sin carreras ----------

	@Test
	void siOtraTransaccionGuardaLaMismaCotizacionAlMismoTiempoLaConsultaTerminaBienYQuedaUnaSolaFila()
			throws Exception {
		elBanguatResponde(fila(USD, FECHA, "7.65"));
		CountDownLatch insertada = new CountDownLatch(1);
		CountDownLatch soltar = new CountDownLatch(1);

		// La tarea diaria (otra transaccion) ya inserto la fila pero todavia no confirma
		Future<?> tareaDiaria = hilos.submit(() -> transaccion.executeWithoutResult(estado -> {
			jdbc.update("INSERT INTO tipo_cambio (fecha, moneda, valor, fuente) VALUES (?, ?, ?, 'BANGUAT')", FECHA,
					USD, new BigDecimal("7.65"));
			insertada.countDown();
			try {
				soltar.await(20, TimeUnit.SECONDS);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
		}));
		assertThat(insertada.await(10, TimeUnit.SECONDS)).isTrue();

		// Una peticion pide esa misma cotizacion: no la ve (no esta confirmada), la pide al Banguat y trata de guardarla
		Future<Cotizacion> peticion = hilos.submit(() -> servicio.obtener(Moneda.USD, FECHA));
		esperarUnaConsultaBloqueada();
		assertThat(peticion.isDone()).as("espera a que la otra transaccion confirme").isFalse();
		soltar.countDown();
		tareaDiaria.get(10, TimeUnit.SECONDS);

		Cotizacion cotizacion = peticion.get(20, TimeUnit.SECONDS);
		assertThat(cotizacion.valor()).isEqualByComparingTo("7.65");
		assertThat(cotizacion.estimado()).isFalse();
		assertThat(filasGuardadas()).isEqualTo(1);
	}

	@Test
	void dosConsultasSimultaneasDeLaMismaCotizacionTerminanBienYGuardanUnaSolaFila() throws Exception {
		elBanguatResponde(fila(USD, FECHA, "7.65"), fila(USD, FECHA.minusDays(1), "7.64"));
		for (int ronda = 1; ronda <= 5; ronda++) {
			jdbc.update("DELETE FROM tipo_cambio");
			CountDownLatch salida = new CountDownLatch(1);
			List<Future<Cotizacion>> consultas = new ArrayList<>();
			for (int i = 0; i < 3; i++) {
				consultas.add(hilos.submit(() -> {
					salida.await();
					return servicio.obtener(Moneda.USD, FECHA);
				}));
			}
			salida.countDown();
			for (Future<Cotizacion> consulta : consultas) {
				assertThat(consulta.get(30, TimeUnit.SECONDS).valor()).as("ronda " + ronda).isEqualByComparingTo("7.65");
			}
			assertThat(filasGuardadas()).as("ronda " + ronda + ": una fila por fecha").isEqualTo(2);
		}
	}

	// ---------- Solo se guardan las filas validas ----------

	@Test
	void unaFilaRotaDelProveedorNoSeGuardaNiHaceFallarLaConsultaDeLasValidas() {
		elBanguatResponde(
				fila(USD, FECHA, "7.65"),
				fila(USD, FECHA.minusDays(1), "0"),
				fila(USD, FECHA.minusDays(2), "-7.5"),
				fila(USD, FECHA.minusDays(3), null),
				fila(USD, FECHA.minusDays(4), "10000000000000"),
				fila(USD, servicio.hoy().plusDays(1), "7.90"),
				fila(999, FECHA, "5.00"),
				new CotizacionMoneda(USD, null, new BigDecimal("7.00"), new BigDecimal("7.00")));

		Cotizacion cotizacion = servicio.obtener(Moneda.USD, FECHA);

		assertThat(cotizacion.valor()).isEqualByComparingTo("7.65");
		assertThat(jdbc.queryForList("SELECT moneda || '|' || fecha || '|' || valor FROM tipo_cambio", String.class))
				.containsExactly("2|2026-10-01|7.650000");
	}

	@Test
	void unaFilaFuturaOConMonedaDesconocidaNuncaSeEligeComoLaUltimaCotizacion() {
		elBanguatResponde(fila(USD, FECHA.minusDays(2), "7.60"), fila(USD, servicio.hoy().plusDays(1), "9.99"),
				fila(999, FECHA, "1.00"));

		Cotizacion cotizacion = servicio.obtener(Moneda.USD, FECHA);

		assertThat(cotizacion.fecha()).isEqualTo(FECHA.minusDays(2));
		assertThat(cotizacion.valor()).isEqualByComparingTo("7.60");
	}

	@Test
	void sinNingunaFilaValidaResponde503YNoGuardaNada() {
		elBanguatResponde(fila(USD, FECHA, "0"), fila(USD, FECHA.minusDays(1), "-1"), fila(999, FECHA, "5"));

		assertThatThrownBy(() -> servicio.obtener(Moneda.USD, FECHA)).isInstanceOf(ResponseStatusException.class)
				.satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
						.isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
		assertThat(filasGuardadas()).isZero();
	}

	@Test
	void unaFilaYaGuardadaNoSeSobreescribeNiSeDuplica() {
		jdbc.update("INSERT INTO tipo_cambio (fecha, moneda, valor, fuente) VALUES (?, ?, 7.10, 'BANGUAT')",
				FECHA.minusDays(1), USD);
		elBanguatResponde(fila(USD, FECHA, "7.65"), fila(USD, FECHA.minusDays(1), "7.99"));

		servicio.obtener(Moneda.USD, FECHA);

		assertThat(filasGuardadas()).isEqualTo(2);
		assertThat(jdbc.queryForObject("SELECT valor FROM tipo_cambio WHERE fecha = ?", BigDecimal.class,
				FECHA.minusDays(1))).isEqualByComparingTo("7.10");
	}

}
