package com.proyecto.tramites.pagos.service;

import com.proyecto.tramites.auditoria.service.BitacoraService;
import com.proyecto.tramites.comun.excepcion.DatosInvalidosException;
import com.proyecto.tramites.comun.util.Actor;
import com.proyecto.tramites.comun.util.Paginacion;
import com.proyecto.tramites.pagos.dto.DecisionPago;
import com.proyecto.tramites.pagos.dto.PagoResponse;
import com.proyecto.tramites.pagos.dto.ValidacionPagoRequest;
import com.proyecto.tramites.pagos.entity.EstadoPago;
import com.proyecto.tramites.pagos.entity.Pago;
import com.proyecto.tramites.pagos.repository.PagoEspecificaciones;
import com.proyecto.tramites.pagos.repository.PagoRepository;
import com.proyecto.tramites.tramites.dto.TramiteResponse;
import com.proyecto.tramites.tramites.dto.TransicionRequest;
import com.proyecto.tramites.tramites.entity.EstadoTramite;
import com.proyecto.tramites.tramites.entity.Tramite;
import com.proyecto.tramites.tramites.repository.TramiteRepository;
import com.proyecto.tramites.tramites.service.TransicionTramiteService;
import java.util.Map;
import java.util.Set;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * Reglas de los pagos. Se registra un pago solo para un tramite en Por pagar, con un unico pago pendiente a
 * la vez. Quien registra un pago no puede resolverlo (segregacion de funciones). Validar un pago finaliza el
 * tramite pasando por la maquina de estados (historial y bitacora incluidos, en la misma transaccion);
 * rechazarlo deja el tramite en Por pagar para que el ciudadano envie otro comprobante.
 */
@Service
public class PagoService {

	private static final Set<String> ORDENABLES = Set.of("id", "creadoEn", "estado", "monto");

	private final PagoRepository pagos;
	private final TramiteRepository tramites;
	private final ComprobanteAlmacen almacen;
	private final BitacoraService bitacora;
	private final TransicionTramiteService transiciones;

	public PagoService(PagoRepository pagos, TramiteRepository tramites, ComprobanteAlmacen almacen,
			BitacoraService bitacora, TransicionTramiteService transiciones) {
		this.pagos = pagos;
		this.tramites = tramites;
		this.almacen = almacen;
		this.bitacora = bitacora;
		this.transiciones = transiciones;
	}

	/** Registra un pago con su comprobante. El monto es el del tipo de tramite al momento de pagar. */
	@Transactional
	public PagoResponse crear(Actor actor, Long tramiteId, MultipartFile comprobante) {
		Tramite tramite = tramites.findByIdAndEliminadoEnIsNull(tramiteId)
				.filter(t -> actor.alcanceTotal() || t.getCiudadanoId().equals(actor.id()))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "El tramite no existe"));
		if (tramite.getEstado() != EstadoTramite.POR_PAGAR) {
			throw new ResponseStatusException(HttpStatus.CONFLICT,
					"Solo se puede registrar un pago cuando el tramite esta en POR_PAGAR");
		}
		if (pagos.existsByTramiteIdAndEstado(tramiteId, EstadoPago.PENDIENTE)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT,
					"El tramite ya tiene un pago pendiente de validacion");
		}
		ComprobanteAlmacen.Almacenado guardado = almacen.guardar(comprobante);
		try {
			Pago pago = pagos.saveAndFlush(new Pago(tramiteId, tramite.getCiudadanoId(),
					tramite.getTipoTramite().getMonto(), guardado.archivo(), guardado.hash(), guardado.tipoMime(),
					guardado.tamano(), actor.id()));
			bitacora.registrar(actor.id(), "CREACION_PAGO", "pago", pago.getId(), null,
					Map.of("tramiteId", tramiteId, "estado", EstadoPago.PENDIENTE.name()));
			return PagoResponse.de(pago, tramite.getEstado());
		}
		catch (RuntimeException e) {
			almacen.borrar(guardado.archivo()); // no dejar un archivo sin pago
			throw e;
		}
	}

	@Transactional(readOnly = true)
	public Page<PagoResponse> listar(Actor actor, EstadoPago estado, Long tramiteId, Pageable paginacion) {
		Pageable pagina = Paginacion.validarOrden(paginacion, ORDENABLES);
		Long dueno = actor.alcanceTotal() ? null : actor.id();
		return pagos.findAll(PagoEspecificaciones.listado(dueno, estado, tramiteId), pagina)
				.map(pago -> PagoResponse.de(pago, null));
	}

	@Transactional(readOnly = true)
	public PagoResponse obtener(Actor actor, Long id) {
		return PagoResponse.de(buscarVisible(actor, id), null);
	}

	/** Contenido del comprobante y su ficha. Mismas reglas de visibilidad que el pago. */
	@Transactional(readOnly = true)
	public Comprobante comprobante(Actor actor, Long id) {
		Pago pago = buscarVisible(actor, id);
		return new Comprobante(almacen.leer(pago.getComprobanteArchivo()), pago.getComprobanteTipo());
	}

	/** Contenido de un comprobante y su tipo, listo para descargar. */
	public record Comprobante(byte[] contenido, String tipoMime) {
	}

	/**
	 * Valida o rechaza un pago pendiente. Quien lo registro no puede resolverlo (403). Al validar, el tramite
	 * pasa a Finalizado por la maquina de estados: si esa transicion falla, no se guarda nada.
	 * <p>
	 * El pago se bloquea al leerlo: si otra persona lo resuelve al mismo tiempo, la segunda decision espera, ve el pago
	 * ya resuelto y recibe 409 en lugar de pisar a la primera. El orden de bloqueos es siempre pago y luego tramite
	 * (la transicion bloquea el tramite); nada bloquea primero el tramite y despues el pago, asi no hay interbloqueo.
	 */
	@Transactional
	public PagoResponse resolver(Actor actor, Long id, ValidacionPagoRequest solicitud) {
		Pago pago = pagos.bloquearPorId(id)
				.filter(p -> actor.alcanceTotal() || p.getCiudadanoId().equals(actor.id()))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "El pago no existe"));
		if (pago.getEstado() != EstadoPago.PENDIENTE) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "El pago ya fue resuelto: " + pago.getEstado());
		}
		if (pago.getCreadoPor().equals(actor.id())) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN,
					"No puedes resolver un pago que tu mismo registraste");
		}
		String comentario = limpiar(solicitud.comentario());
		if (solicitud.decision() == DecisionPago.RECHAZAR) {
			if (comentario == null) {
				throw DatosInvalidosException.de("comentario", "Es obligatorio al rechazar un pago");
			}
			pago.rechazar(actor.id(), comentario);
			pagos.saveAndFlush(pago);
			bitacora.registrar(actor.id(), "RECHAZO_PAGO", "pago", pago.getId(),
					Map.of("estado", EstadoPago.PENDIENTE.name()), Map.of("estado", EstadoPago.RECHAZADO.name()));
			return PagoResponse.de(pago, EstadoTramite.POR_PAGAR);
		}
		pago.validar(actor.id(), comentario);
		pagos.saveAndFlush(pago);
		bitacora.registrar(actor.id(), "VALIDACION_PAGO", "pago", pago.getId(),
				Map.of("estado", EstadoPago.PENDIENTE.name()), Map.of("estado", EstadoPago.VALIDADO.name()));
		TramiteResponse tramite = transiciones.transicionar(actor, pago.getTramiteId(),
				new TransicionRequest(EstadoTramite.FINALIZADO, null));
		return PagoResponse.de(pago, tramite.estado());
	}

	private Pago buscarVisible(Actor actor, Long id) {
		return pagos.findById(id)
				.filter(pago -> actor.alcanceTotal() || pago.getCiudadanoId().equals(actor.id()))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "El pago no existe"));
	}

	private static String limpiar(String texto) {
		return texto == null || texto.isBlank() ? null : texto.trim();
	}

}
