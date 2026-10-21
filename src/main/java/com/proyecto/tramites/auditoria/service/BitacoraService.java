package com.proyecto.tramites.auditoria.service;

import com.proyecto.tramites.auditoria.entity.Bitacora;
import com.proyecto.tramites.auditoria.repository.BitacoraRepository;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import tools.jackson.databind.json.JsonMapper;

/**
 * Escribe en la bitacora. Exige una transaccion ya abierta (MANDATORY): el registro y la accion que
 * registra se guardan juntos o no se guarda ninguno. Una accion sin bitacora no puede existir.
 */
@Service
public class BitacoraService {

	private static final int LARGO_MAXIMO_IP = 45;

	private final BitacoraRepository bitacora;
	private final JsonMapper json;

	public BitacoraService(BitacoraRepository bitacora, JsonMapper json) {
		this.bitacora = bitacora;
		this.json = json;
	}

	/**
	 * Registra una accion con quien la hizo, sobre que recurso y desde que direccion. En antes y despues va
	 * solo lo necesario para entender el cambio (por ejemplo el estado o los nombres de los campos tocados),
	 * nunca claves, tokens ni datos personales.
	 */
	@Transactional(propagation = Propagation.MANDATORY)
	public void registrar(Long actorId, String accion, String recurso, Long recursoId,
			Map<String, Object> antes, Map<String, Object> despues) {
		bitacora.saveAndFlush(new Bitacora(actorId, accion, recurso, recursoId, aJson(antes), aJson(despues),
				direccionDeLaPeticion()));
	}

	/**
	 * Direccion IP de quien hizo la peticion, tal como la ve el servidor. Este codigo nunca lee X-Forwarded-For por su
	 * cuenta (cualquiera puede inventarlo). Detras de Nginx, Tomcat reemplaza esta direccion por la del cliente real
	 * solo si la peticion llega desde un proxy de confianza (FORWARD_HEADERS=native y PROXIES_CONFIANZA, tarjeta 45);
	 * si no esta configurado, queda la direccion del proxy.
	 */
	private static String direccionDeLaPeticion() {
		if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes atributos) {
			String ip = atributos.getRequest().getRemoteAddr();
			return ip == null || ip.length() > LARGO_MAXIMO_IP ? null : ip;
		}
		return null;
	}

	private String aJson(Map<String, Object> valores) {
		return valores == null ? null : json.writeValueAsString(valores);
	}

}
