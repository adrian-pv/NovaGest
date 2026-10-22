package com.proyecto.tramites.divisas.service;

import com.proyecto.tramites.comun.excepcion.DatosInvalidosException;
import com.proyecto.tramites.divisas.dto.Cotizacion;
import com.proyecto.tramites.divisas.dto.CotizacionMoneda;
import com.proyecto.tramites.divisas.dto.Moneda;
import com.proyecto.tramites.divisas.entity.TipoCambio;
import com.proyecto.tramites.divisas.repository.TipoCambioRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Tarjeta 22: obtiene el tipo de cambio de una moneda para una fecha.
 * <ol>
 * <li>Si ya esta guardado el valor de esa fecha, lo usa.</li>
 * <li>Si no, lo consulta al Banguat (los ultimos 10 dias, para cubrir fines de semana y feriados), guarda lo
 * que llegue y usa el ultimo valor hasta esa fecha.</li>
 * <li>Si el Banguat no responde, usa el ultimo valor guardado y lo marca como estimado (RNF-04).</li>
 * <li>Si tampoco hay nada guardado, responde 503.</li>
 * </ol>
 * Solo este modulo habla con el Banguat, y solo le envia fechas y codigos de moneda.
 */
@Service
public class TipoCambioService {

	public static final ZoneId GUATEMALA = ZoneId.of("America/Guatemala");
	static final String FUENTE = "BANGUAT";

	private static final Logger LOG = LoggerFactory.getLogger(TipoCambioService.class);
	private static final int DIAS_HACIA_ATRAS = 10;
	/** NUMERIC(18,6) deja 12 digitos antes del punto. */
	private static final int MAX_ENTEROS = 12;

	private final TipoCambioRepository tipos;
	private final BanguatClient banguat;
	private final Clock reloj;

	public TipoCambioService(TipoCambioRepository tipos, BanguatClient banguat, Clock reloj) {
		this.tipos = tipos;
		this.banguat = banguat;
		this.reloj = reloj;
	}

	public LocalDate hoy() {
		return LocalDate.now(reloj.withZone(GUATEMALA));
	}

	/** Fecha para la que se pide el tipo de cambio: hoy si no viene, y nunca una fecha futura. */
	public LocalDate fechaDeConsulta(LocalDate fecha) {
		LocalDate hoy = hoy();
		if (fecha == null) {
			return hoy;
		}
		if (fecha.isAfter(hoy)) {
			throw DatosInvalidosException.de("fecha", "No puede ser una fecha futura");
		}
		return fecha;
	}

	@Transactional
	public Cotizacion obtener(Moneda moneda, LocalDate fecha) {
		int codigo = moneda.codigoBanguat();
		Optional<TipoCambio> guardado = tipos.findFirstByMonedaAndFechaLessThanEqualOrderByFechaDesc(codigo, fecha);
		if (guardado.isPresent() && guardado.get().getFecha().equals(fecha)) {
			return deGuardado(guardado.get(), false);
		}

		try {
			LocalDate desde = fecha.minusDays(DIAS_HACIA_ATRAS);
			List<CotizacionMoneda> filas = moneda.esDolar() ? banguat.tipoCambioRango(desde, fecha)
					: banguat.tipoCambioRangoMoneda(desde, fecha, codigo);
			List<CotizacionMoneda> validas = filas.stream().filter(this::esValida).toList();
			if (validas.size() < filas.size()) {
				LOG.warn("El Banguat envio {} filas no validas de la moneda {}: se ignoran", filas.size() - validas.size(),
						codigo);
			}
			guardar(validas);
			Optional<CotizacionMoneda> ultima = validas.stream()
					.filter(f -> f.moneda() == codigo && !f.fecha().isAfter(fecha))
					.max(Comparator.comparing(CotizacionMoneda::fecha));
			if (ultima.isPresent()) {
				return new Cotizacion(ultima.get().fecha(), ultima.get().venta(), FUENTE, false);
			}
			LOG.warn("El Banguat no trajo valores de la moneda {} entre {} y {}", codigo, desde, fecha);
		}
		catch (BanguatException ex) {
			LOG.warn("Banguat no disponible para la moneda {}: {}", codigo, ex.getMessage());
		}

		return guardado.map(tipo -> deGuardado(tipo, true))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
						"El tipo de cambio no esta disponible en este momento. Intenta mas tarde."));
	}

	/**
	 * Solo se guarda lo que la base aceptaria y tiene sentido: moneda del catalogo, fecha que no sea futura y un valor
	 * positivo que quepa en NUMERIC(18,6) (12 enteros). Una fila rota (valor cero, moneda desconocida...) se descarta; sin
	 * este filtro llegaria a la base, violaria un CHECK y haria fallar la consulta de todas las demas filas.
	 */
	private boolean esValida(CotizacionMoneda fila) {
		if (fila == null || fila.fecha() == null || fila.venta() == null || fila.fecha().isAfter(hoy())) {
			return false;
		}
		boolean monedaConocida = Arrays.stream(Moneda.values()).anyMatch(m -> m.codigoBanguat() == fila.moneda());
		return monedaConocida && fila.venta().signum() > 0
				&& fila.venta().precision() - fila.venta().scale() <= MAX_ENTEROS;
	}

	/** Inserta de forma idempotente (ver {@link TipoCambioRepository#insertarSiNoExiste}): nunca choca con otra escritura. */
	private void guardar(List<CotizacionMoneda> filas) {
		for (CotizacionMoneda fila : filas) {
			tipos.insertarSiNoExiste(fila.fecha(), fila.moneda(), fila.venta(), FUENTE);
		}
	}

	private static Cotizacion deGuardado(TipoCambio tipo, boolean estimado) {
		return new Cotizacion(tipo.getFecha(), tipo.getValor(), tipo.getFuente(), estimado);
	}

}
