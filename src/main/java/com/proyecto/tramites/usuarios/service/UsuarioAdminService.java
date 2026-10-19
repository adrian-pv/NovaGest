package com.proyecto.tramites.usuarios.service;

import com.proyecto.tramites.auditoria.service.BitacoraService;
import com.proyecto.tramites.auth.repository.TokenRenovacionRepository;
import com.proyecto.tramites.comun.excepcion.DatosInvalidosException;
import com.proyecto.tramites.comun.util.Actor;
import com.proyecto.tramites.comun.util.Paginacion;
import com.proyecto.tramites.usuarios.dto.UsuarioActualizarRequest;
import com.proyecto.tramites.usuarios.dto.UsuarioAdminResponse;
import com.proyecto.tramites.usuarios.dto.UsuarioCrearRequest;
import com.proyecto.tramites.usuarios.entity.Rol;
import com.proyecto.tramites.usuarios.entity.Usuario;
import com.proyecto.tramites.usuarios.repository.RolRepository;
import com.proyecto.tramites.usuarios.repository.UsuarioEspecificaciones;
import com.proyecto.tramites.usuarios.repository.UsuarioRepository;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Tarjeta 12: administracion de usuarios. Reglas:
 * <ul>
 * <li>Nadie puede desactivarse, cambiarse los roles ni eliminarse a si mismo: asi un administrador no se deja
 * fuera del sistema por error. Su propio perfil lo edita en /api/usuarios/yo.</li>
 * <li>Al desactivar o eliminar a alguien se revocan sus tokens de renovacion; el token de acceso deja de servir
 * en la siguiente peticion porque el filtro revisa la base cada vez.</li>
 * <li>La bitacora guarda roles y estado, nunca el correo, el nombre ni la clave.</li>
 * </ul>
 */
@Service
public class UsuarioAdminService {

	private static final Set<String> ORDENABLES = Set.of("nombre", "correo", "creadoEn");

	private final UsuarioRepository usuarios;
	private final RolRepository roles;
	private final PasswordEncoder codificador;
	private final TokenRenovacionRepository renovaciones;
	private final BitacoraService bitacora;
	private final Clock reloj;

	public UsuarioAdminService(UsuarioRepository usuarios, RolRepository roles, PasswordEncoder codificador,
			TokenRenovacionRepository renovaciones, BitacoraService bitacora, Clock reloj) {
		this.usuarios = usuarios;
		this.roles = roles;
		this.codificador = codificador;
		this.renovaciones = renovaciones;
		this.bitacora = bitacora;
		this.reloj = reloj;
	}

	@Transactional(readOnly = true)
	public Page<UsuarioAdminResponse> listar(Boolean activo, String rol, String buscar, Pageable paginacion) {
		Pageable pagina = Paginacion.validarOrden(paginacion, ORDENABLES);
		return usuarios.findAll(UsuarioEspecificaciones.listado(activo, limpiar(rol), limpiar(buscar)), pagina)
				.map(usuario -> UsuarioAdminResponse.de(usuario, reloj.instant()));
	}

	@Transactional(readOnly = true)
	public UsuarioAdminResponse obtener(Long id) {
		return UsuarioAdminResponse.de(buscar(id), reloj.instant());
	}

	@Transactional
	public UsuarioAdminResponse crear(Actor actor, UsuarioCrearRequest solicitud) {
		String correo = solicitud.correo().trim().toLowerCase(Locale.ROOT);
		if (usuarios.existsByCorreoIgnoreCaseAndEliminadoEnIsNull(correo)) {
			throw correoEnUso();
		}
		Usuario usuario = new Usuario(correo, solicitud.nombre().trim(), codificador.encode(solicitud.clave()));
		usuario.getRoles().addAll(resolverRoles(solicitud.roles()));
		try {
			usuarios.saveAndFlush(usuario);
		}
		catch (DataIntegrityViolationException e) {
			throw correoEnUso();
		}
		bitacora.registrar(actor.id(), "CREAR_USUARIO", "usuario", usuario.getId(), null, resumen(usuario));
		return UsuarioAdminResponse.de(usuario, reloj.instant());
	}

	@Transactional
	public UsuarioAdminResponse actualizar(Actor actor, Long id, UsuarioActualizarRequest solicitud) {
		Usuario usuario = buscar(id);
		Map<String, Object> antes = resumen(usuario);
		Set<Rol> nuevosRoles = resolverRoles(solicitud.roles());
		boolean cambiaRoles = !nombres(nuevosRoles).equals(nombres(usuario.getRoles()));
		boolean desactiva = usuario.isActivo() && !solicitud.activo();
		if (usuario.getId().equals(actor.id()) && (cambiaRoles || desactiva)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT,
					"No puedes cambiar tus propios roles ni desactivar tu propia cuenta");
		}
		usuario.setNombre(solicitud.nombre().trim());
		usuario.setActivo(solicitud.activo());
		usuario.getRoles().clear();
		usuario.getRoles().addAll(nuevosRoles);
		usuarios.saveAndFlush(usuario);
		if (desactiva) {
			renovaciones.revocarTodosDe(usuario.getId(), reloj.instant());
		}
		bitacora.registrar(actor.id(), "EDITAR_USUARIO", "usuario", usuario.getId(), antes, resumen(usuario));
		return UsuarioAdminResponse.de(usuario, reloj.instant());
	}

	/** Quita el bloqueo por intentos fallidos antes de que venza solo. */
	@Transactional
	public UsuarioAdminResponse desbloquear(Actor actor, Long id) {
		Usuario usuario = buscar(id);
		Map<String, Object> antes = Map.of("bloqueado", usuario.estaBloqueado(reloj.instant()),
				"intentosFallidos", usuario.getIntentosFallidos());
		usuario.setIntentosFallidos(0);
		usuario.setBloqueadoHasta(null);
		usuarios.saveAndFlush(usuario);
		bitacora.registrar(actor.id(), "DESBLOQUEAR_USUARIO", "usuario", usuario.getId(), antes,
				Map.of("bloqueado", false, "intentosFallidos", 0));
		return UsuarioAdminResponse.de(usuario, reloj.instant());
	}

	/** Eliminacion logica: el registro queda en la base, la cuenta se desactiva y el correo queda libre. */
	@Transactional
	public void eliminar(Actor actor, Long id) {
		Usuario usuario = buscar(id);
		if (usuario.getId().equals(actor.id())) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "No puedes eliminar tu propia cuenta");
		}
		Map<String, Object> antes = resumen(usuario);
		usuario.eliminarLogicamente();
		usuarios.saveAndFlush(usuario);
		renovaciones.revocarTodosDe(usuario.getId(), reloj.instant());
		bitacora.registrar(actor.id(), "ELIMINAR_USUARIO", "usuario", usuario.getId(), antes,
				Map.of("eliminado", true));
	}

	/** Convierte los nombres pedidos en roles. Si alguno no existe responde 400 indicando cual. */
	private Set<Rol> resolverRoles(List<String> pedidos) {
		Set<String> nombres = pedidos.stream().map(n -> n.trim().toUpperCase(Locale.ROOT))
				.collect(Collectors.toCollection(LinkedHashSet::new));
		List<Rol> encontrados = roles.findByNombreIn(nombres);
		Set<String> existentes = nombres(encontrados);
		DatosInvalidosException.Acumulador errores = new DatosInvalidosException.Acumulador();
		nombres.stream().filter(n -> !existentes.contains(n))
				.forEach(n -> errores.agregar("roles", "No existe el rol " + n));
		errores.lanzarSiHayErrores();
		return new LinkedHashSet<>(encontrados);
	}

	private static Set<String> nombres(java.util.Collection<Rol> lista) {
		return lista.stream().map(Rol::getNombre).collect(Collectors.toSet());
	}

	/** Lo que queda en la bitacora de un usuario: sus roles y si esta activo. Sin datos personales. */
	private static Map<String, Object> resumen(Usuario usuario) {
		Map<String, Object> resumen = new LinkedHashMap<>();
		resumen.put("roles", usuario.getRoles().stream().map(Rol::getNombre).sorted().toList());
		resumen.put("activo", usuario.isActivo());
		return resumen;
	}

	private Usuario buscar(Long id) {
		return usuarios.findConRolesYPermisosByIdAndEliminadoEnIsNull(id)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "El usuario no existe"));
	}

	private static String limpiar(String texto) {
		return texto == null || texto.isBlank() ? null : texto.trim();
	}

	private static ResponseStatusException correoEnUso() {
		return new ResponseStatusException(HttpStatus.CONFLICT, "El correo ya esta registrado");
	}

}
