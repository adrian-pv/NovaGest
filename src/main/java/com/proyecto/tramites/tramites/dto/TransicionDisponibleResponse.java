package com.proyecto.tramites.tramites.dto;

import com.proyecto.tramites.tramites.entity.EstadoTramite;
import com.proyecto.tramites.tramites.entity.TransicionTramite;

/**
 * Una transicion que quien consulta tiene autoridad para hacer sobre el tramite desde su estado actual.
 * ejecutable es falso cuando aun no se cumple una condicion (datos obligatorios incompletos o pago sin validar);
 * motivo explica cual, para que la interfaz muestre el boton desactivado con su razon.
 */
public record TransicionDisponibleResponse(String accion, EstadoTramite estadoDestino, boolean comentarioObligatorio,
		boolean ejecutable, String motivo) {

	public static TransicionDisponibleResponse de(TransicionTramite transicion, String motivo) {
		return new TransicionDisponibleResponse(transicion.name(), transicion.hasta(),
				transicion.comentarioObligatorio(), motivo == null, motivo);
	}

}
