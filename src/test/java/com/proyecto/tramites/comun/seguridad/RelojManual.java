package com.proyecto.tramites.comun.seguridad;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** Reloj de pruebas que solo avanza cuando se le ordena. */
class RelojManual extends Clock {

	private Instant ahora = Instant.parse("2026-10-20T12:00:00Z");

	void avanzar(Duration tiempo) {
		ahora = ahora.plus(tiempo);
	}

	@Override
	public ZoneId getZone() {
		return ZoneOffset.UTC;
	}

	@Override
	public Clock withZone(ZoneId zona) {
		return this;
	}

	@Override
	public Instant instant() {
		return ahora;
	}

}
