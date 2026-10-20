package com.proyecto.tramites.tramites.service;

import com.proyecto.tramites.auditoria.service.BitacoraService;
import com.proyecto.tramites.comun.excepcion.DatosInvalidosException;
import com.proyecto.tramites.comun.util.Actor;
import com.proyecto.tramites.tramites.dto.TramiteResponse;
import com.proyecto.tramites.tramites.dto.TransicionDisponibleResponse;
import com.proyecto.tramites.tramites.dto.TransicionRequest;
import com.proyecto.tramites.tramites.entity.EstadoTramite;
import com.proyecto.tramites.tramites.entity.TransicionTramite;
import com.proyecto.tramites.tramites.entity.Tramite;
import com.proyecto.tramites.tramites.entity.TramiteHistorial;
import com.proyecto.tramites.tramites.repository.TramiteHistorialRepository;
import com.proyecto.tramites.tramites.repository.TramiteRepository;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Unico camino para cambiar el estado de un tramite. Valida, en este orden: que el tramite sea visible para
 * quien lo pide (404), que la transicion exista desde el estado actual (409), que esa persona pueda hacerla
 * (403) y que se cumpla su condicion (400 o 409). Si todo pasa, cambia el estado y escribe el historial y la
 * bitacora en la misma transaccion: se guardan los tres o ninguno.
 */
@Service
public class TransicionTramiteService {

	private final TramiteRepository tramites;
	private final TramiteHistorialRepository historial;
	private final BitacoraService bitacora;
	private final ValidadorDatosTramite validador;
	private final ConsultaPagos pagos;

	public TransicionTramiteService(TramiteRepository tramites, TramiteHistorialRepository historial,
			BitacoraService bitacora, ValidadorDatosTramite validador, ConsultaPagos pagos) {
		this.tramites = tramites;
		this.historial = historial;
		this.bitacora = bitacora;
		this.validador = validador;
		this.pagos = pagos;
	}

	@Transactional
	public TramiteResponse transicionar(Actor actor, Long id, TransicionRequest solicitud) {
		Tramite tramite = tramites.bloquearPorId(id)
				.filter(t -> actor.alcanceTotal() || t.getCiudadanoId().equals(actor.id()))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "El tramite no existe"));
		EstadoTramite anterior = tramite.getEstado();
		TransicionTramite transicion = TransicionTramite.buscar(anterior, solicitud.estadoDestino())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
						"Transicion no permitida: de " + anterior + " a " + solicitud.estadoDestino()));
		verificarQuien(actor, tramite, transicion);
		String comentario = limpiar(solicitud.comentario());
		verificarCondiciones(tramite, transicion, comentario);

		tramite.cambiarEstado(transicion.hasta());
		if (transicion.asignaGestor()) {
			tramite.asignarGestor(actor.id());
		}
		if (transicion.comentarioObligatorio()) {
			tramite.registrarMotivo(comentario);
		}
		tramites.saveAndFlush(tramite);
		historial.save(new TramiteHistorial(id, anterior, transicion.hasta(), actor.id(), comentario));
		bitacora.registrar(actor.id(), "TRANSICION_TRAMITE", "tramite", id,
				Map.of("estado", anterior.name()), resultado(tramite));
		return TramiteResponse.de(tramite, validador.deJson(tramite.getDatos()));
	}

	/**
	 * Tarjeta 28: las transiciones que quien consulta puede hacer desde el estado actual del tramite, con las mismas
	 * reglas que aplica transicionar (visibilidad, quien, y condiciones). Quien no tiene el permiso de editar no
	 * puede ejecutar ninguna, asi que recibe la lista vacia. Tramite ajeno o inexistente: 404.
	 */
	@Transactional(readOnly = true)
	public List<TransicionDisponibleResponse> disponibles(Actor actor, Long id, boolean puedeEditar) {
		Tramite tramite = tramites.findByIdAndEliminadoEnIsNull(id)
				.filter(t -> actor.alcanceTotal() || t.getCiudadanoId().equals(actor.id()))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "El tramite no existe"));
		if (!puedeEditar) {
			return List.of();
		}
		return Arrays.stream(TransicionTramite.values())
				.filter(t -> t.desde() == tramite.getEstado())
				.filter(t -> tieneAutoridad(actor, tramite, t))
				.map(t -> TransicionDisponibleResponse.de(t, motivoNoEjecutable(tramite, t)))
				.toList();
	}

	/** Por que todavia no se puede ejecutar, o null si ya se puede. Los comentarios los pide la interfaz al enviar. */
	private String motivoNoEjecutable(Tramite tramite, TransicionTramite transicion) {
		if (transicion.exigeDatosCompletos()) {
			try {
				validador.exigirCompletitud(tramite.getTipoTramite(), validador.deJson(tramite.getDatos()));
			}
			catch (DatosInvalidosException e) {
				return "Faltan campos obligatorios del tramite";
			}
		}
		if (transicion.exigePagoValidado() && !pagos.tienePagoValidado(tramite.getId())) {
			return "El tramite no tiene un pago validado";
		}
		return null;
	}

	private static boolean tieneAutoridad(Actor actor, Tramite tramite, TransicionTramite transicion) {
		return switch (transicion.quien()) {
			case DUENO -> tramite.getCiudadanoId().equals(actor.id());
			case GESTION -> actor.alcanceTotal();
		};
	}

	private static void verificarQuien(Actor actor, Tramite tramite, TransicionTramite transicion) {
		if (!tieneAutoridad(actor, tramite, transicion)) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes realizar esta transicion");
		}
	}

	private void verificarCondiciones(Tramite tramite, TransicionTramite transicion, String comentario) {
		if (transicion.comentarioObligatorio() && comentario == null) {
			throw DatosInvalidosException.de("comentario", "Es obligatorio en esta transicion");
		}
		if (transicion.exigeDatosCompletos()) {
			validador.exigirCompletitud(tramite.getTipoTramite(), validador.deJson(tramite.getDatos()));
		}
		if (transicion.exigePagoValidado() && !pagos.tienePagoValidado(tramite.getId())) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "El tramite no tiene un pago validado");
		}
	}

	/** Lo que queda en la bitacora tras el cambio: el estado y el gestor asignado, nunca datos personales. */
	private static Map<String, Object> resultado(Tramite tramite) {
		Map<String, Object> despues = new LinkedHashMap<>();
		despues.put("estado", tramite.getEstado().name());
		if (tramite.getGestorId() != null) {
			despues.put("gestorId", tramite.getGestorId());
		}
		return despues;
	}

	private static String limpiar(String texto) {
		return texto == null || texto.isBlank() ? null : texto.trim();
	}

}
