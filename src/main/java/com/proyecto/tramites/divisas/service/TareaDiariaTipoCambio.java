package com.proyecto.tramites.divisas.service;

import com.proyecto.tramites.comun.util.BloqueoDeTarea;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Tarjeta 21: tarea programada que guarda cada dia habil el tipo de cambio de todas las monedas.
 * Horario por defecto: lunes a viernes a las 08:15 (hora de Guatemala); se cambia con
 * app.divisas.tarea-diaria.cron. Se apaga con app.divisas.tarea-diaria.habilitada=false (asi esta en pruebas),
 * o con el cron "-" (Spring lo toma como desactivado).
 * <p>
 * Con dos instancias sobre la misma base (Ubuntu y Windows) la tarea puede quedar activa en las dos: un candado de la
 * base ({@link BloqueoDeTarea}) deja que solo una la ejecute a la vez. Aun asi, lo recomendado es dejarla activa en una
 * sola (ver docs/dos-instancias.md).
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "app.divisas.tarea-diaria.habilitada", havingValue = "true", matchIfMissing = true)
public class TareaDiariaTipoCambio {

	/** Identifica esta tarea en la base; no debe repetirse con la de otra tarea. */
	static final long CANDADO = 2026_21_01L;

	private static final Logger LOG = LoggerFactory.getLogger(TareaDiariaTipoCambio.class);

	private final ActualizacionTipoCambioService actualizacion;
	private final BloqueoDeTarea bloqueo;

	public TareaDiariaTipoCambio(ActualizacionTipoCambioService actualizacion, BloqueoDeTarea bloqueo) {
		this.actualizacion = actualizacion;
		this.bloqueo = bloqueo;
	}

	@Scheduled(cron = "${app.divisas.tarea-diaria.cron:0 15 8 * * MON-FRI}", zone = "America/Guatemala")
	public void ejecutar() {
		if (!bloqueo.ejecutarSiLibre(CANDADO, actualizacion::actualizarHoy)) {
			LOG.info("Tipos de cambio: otra instancia ya esta ejecutando la tarea; se omite en esta");
		}
	}

}
