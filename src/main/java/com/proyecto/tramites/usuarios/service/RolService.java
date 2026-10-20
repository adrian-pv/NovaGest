package com.proyecto.tramites.usuarios.service;

import com.proyecto.tramites.auditoria.service.BitacoraService;
import com.proyecto.tramites.comun.excepcion.DatosInvalidosException;
import com.proyecto.tramites.comun.util.Actor;
import com.proyecto.tramites.usuarios.dto.PermisoResponse;
import com.proyecto.tramites.usuarios.dto.RolRequest;
import com.proyecto.tramites.usuarios.dto.RolResponse;
import com.proyecto.tramites.usuarios.entity.Permiso;
import com.proyecto.tramites.usuarios.entity.Rol;
import com.proyecto.tramites.usuarios.entity.Usuario;
import com.proyecto.tramites.usuarios.repository.PermisoRepository;
import com.proyecto.tramites.usuarios.repository.RolRepository;
import com.proyecto.tramites.usuarios.repository.UsuarioRepository;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Tarjeta 12: administracion de roles. Un rol es solo un conjunto de permisos, asi que crear o ajustar uno no
 * exige tocar codigo. Reglas:
 * <ul>
 * <li>Los cuatro roles del plan (CIUDADANO, GESTOR, AUDITOR, ADMINISTRADOR) no se renombran ni se eliminan:
 * el registro publico asigna CIUDADANO por nombre. Sus permisos si se pueden ajustar.</li>
 * <li>Un rol con usuarios asignados no se elimina; primero hay que cambiarles el rol.</li>
 * <li>Nadie puede quitarse a si mismo el permiso rol:editar, para no quedarse sin forma de deshacer el cambio.</li>
 * </ul>
 */
@Service
public class RolService {

	/** Roles que cargo la migracion V2 y que el resto del sistema da por existentes. */
	static final Set<String> ROLES_BASE = Set.of("CIUDADANO", "GESTOR", "AUDITOR", "ADMINISTRADOR");

	private static final String PERMISO_ADMINISTRAR_ROLES = "rol:editar";

	private final RolRepository roles;
	private final PermisoRepository permisos;
	private final UsuarioRepository usuarios;
	private final BitacoraService bitacora;

	public RolService(RolRepository roles, PermisoRepository permisos, UsuarioRepository usuarios,
			BitacoraService bitacora) {
		this.roles = roles;
		this.permisos = permisos;
		this.usuarios = usuarios;
		this.bitacora = bitacora;
	}

	@Transactional(readOnly = true)
	public List<RolResponse> listar() {
		return roles.findAllByOrderByNombreAsc().stream().map(RolResponse::de).toList();
	}

	@Transactional(readOnly = true)
	public RolResponse obtener(Long id) {
		return RolResponse.de(buscar(id));
	}

	/** Catalogo de permisos que se pueden asignar a un rol. */
	@Transactional(readOnly = true)
	public List<PermisoResponse> listarPermisos() {
		return permisos.findAll().stream()
				.sorted(Comparator.comparing(Permiso::getNombre))
				.map(PermisoResponse::de).toList();
	}

	@Transactional
	public RolResponse crear(Actor actor, RolRequest solicitud) {
		String nombre = solicitud.nombre();
		if (roles.existsByNombreIgnoreCase(nombre)) {
			throw nombreEnUso();
		}
		Rol rol = new Rol(nombre, limpiar(solicitud.descripcion()));
		rol.definir(nombre, limpiar(solicitud.descripcion()), solicitud.alcanceTotal());
		rol.getPermisos().addAll(resolverPermisos(solicitud.permisos()));
		Rol guardado = roles.saveAndFlush(rol);
		bitacora.registrar(actor.id(), "CREAR_ROL", "rol", guardado.getId(), null, resumen(guardado));
		return RolResponse.de(guardado);
	}

	@Transactional
	public RolResponse actualizar(Actor actor, Long id, RolRequest solicitud) {
		Rol rol = buscar(id);
		Map<String, Object> antes = resumen(rol);
		String nombre = solicitud.nombre();
		if (ROLES_BASE.contains(rol.getNombre()) && !rol.getNombre().equals(nombre)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "Los roles base del sistema no se pueden renombrar");
		}
		if (roles.existsByNombreIgnoreCaseAndIdNot(nombre, id)) {
			throw nombreEnUso();
		}
		Set<Permiso> nuevos = resolverPermisos(solicitud.permisos());
		evitarPerderAdministracion(actor, rol, nuevos);
		rol.definir(nombre, limpiar(solicitud.descripcion()), solicitud.alcanceTotal());
		rol.getPermisos().clear();
		rol.getPermisos().addAll(nuevos);
		Rol guardado = roles.saveAndFlush(rol);
		bitacora.registrar(actor.id(), "EDITAR_ROL", "rol", guardado.getId(), antes, resumen(guardado));
		return RolResponse.de(guardado);
	}

	/** Se borra de verdad (el rol no tiene datos personales): solo si no es base y nadie lo tiene asignado. */
	@Transactional
	public void eliminar(Actor actor, Long id) {
		Rol rol = buscar(id);
		if (ROLES_BASE.contains(rol.getNombre())) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "Los roles base del sistema no se pueden eliminar");
		}
		if (roles.contarUsuariosConRol(rol.getId()) > 0) {
			throw new ResponseStatusException(HttpStatus.CONFLICT,
					"El rol tiene usuarios asignados; cambiales el rol antes de eliminarlo");
		}
		Map<String, Object> antes = resumen(rol);
		rol.getPermisos().clear();
		roles.delete(rol);
		roles.flush();
		bitacora.registrar(actor.id(), "ELIMINAR_ROL", "rol", id, antes, Map.of("eliminado", true));
	}

	/**
	 * Si el actor tiene este rol y despues del cambio ya no le quedaria rol:editar por ningun otro de sus roles,
	 * responde 409: se estaria quitando a si mismo la posibilidad de administrar roles.
	 */
	private void evitarPerderAdministracion(Actor actor, Rol rol, Set<Permiso> nuevos) {
		Usuario yo = usuarios.findConRolesYPermisosByIdAndEliminadoEnIsNull(actor.id()).orElse(null);
		if (yo == null || yo.getRoles().stream().noneMatch(r -> r.getId().equals(rol.getId()))) {
			return;
		}
		Set<String> quedarian = new HashSet<>();
		yo.getRoles().stream().filter(r -> !r.getId().equals(rol.getId()))
				.flatMap(r -> r.getPermisos().stream()).map(Permiso::getNombre).forEach(quedarian::add);
		nuevos.stream().map(Permiso::getNombre).forEach(quedarian::add);
		if (!quedarian.contains(PERMISO_ADMINISTRAR_ROLES)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT,
					"No puedes quitarte a ti mismo el permiso " + PERMISO_ADMINISTRAR_ROLES);
		}
	}

	/** Convierte la lista recurso:accion en permisos. Si alguno no existe responde 400 indicando cual. */
	private Set<Permiso> resolverPermisos(List<String> pedidos) {
		Map<String, Permiso> catalogo = permisos.findAll().stream()
				.collect(Collectors.toMap(Permiso::getNombre, Function.identity()));
		DatosInvalidosException.Acumulador errores = new DatosInvalidosException.Acumulador();
		Set<Permiso> resultado = new LinkedHashSet<>();
		for (String pedido : pedidos) {
			Permiso permiso = catalogo.get(pedido.trim());
			if (permiso == null) {
				errores.agregar("permisos", "No existe el permiso " + pedido.trim());
			}
			else {
				resultado.add(permiso);
			}
		}
		errores.lanzarSiHayErrores();
		return resultado;
	}

	/** Lo que queda en la bitacora de un rol: nombre, alcance y la lista de permisos. */
	private static Map<String, Object> resumen(Rol rol) {
		Map<String, Object> resumen = new LinkedHashMap<>();
		resumen.put("nombre", rol.getNombre());
		resumen.put("alcanceTotal", rol.isAlcanceTotal());
		resumen.put("permisos", rol.getPermisos().stream().map(Permiso::getNombre).sorted().toList());
		return resumen;
	}

	private Rol buscar(Long id) {
		return roles.findConPermisosById(id)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "El rol no existe"));
	}

	private static String limpiar(String texto) {
		return texto == null || texto.isBlank() ? null : texto.trim();
	}

	private static ResponseStatusException nombreEnUso() {
		return new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un rol con ese nombre");
	}

}
