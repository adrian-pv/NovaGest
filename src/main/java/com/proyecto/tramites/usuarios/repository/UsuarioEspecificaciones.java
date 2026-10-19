package com.proyecto.tramites.usuarios.repository;

import com.proyecto.tramites.usuarios.entity.Rol;
import com.proyecto.tramites.usuarios.entity.Usuario;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

/**
 * Tarjeta 12: arma la consulta del listado de usuarios con los filtros que vengan.
 * Siempre excluye los eliminados de forma logica.
 */
public final class UsuarioEspecificaciones {

	private UsuarioEspecificaciones() {
	}

	/**
	 * @param activo solo activos (true), solo inactivos (false) o todos (null)
	 * @param rol nombre exacto de un rol; null para no filtrar
	 * @param buscar texto que debe aparecer en el nombre o el correo; null para no filtrar
	 */
	public static Specification<Usuario> listado(Boolean activo, String rol, String buscar) {
		return (raiz, consulta, cb) -> {
			List<Predicate> condiciones = new ArrayList<>();
			condiciones.add(cb.isNull(raiz.get("eliminadoEn")));
			if (activo != null) {
				condiciones.add(cb.equal(raiz.get("activo"), activo));
			}
			if (rol != null) {
				// Subconsulta en vez de join: asi un usuario con varios roles no sale repetido en la pagina
				Subquery<Long> conRol = consulta.subquery(Long.class);
				Root<Usuario> otro = conRol.from(Usuario.class);
				Join<Usuario, Rol> roles = otro.join("roles");
				conRol.select(otro.<Long>get("id")).where(cb.equal(otro.get("id"), raiz.get("id")),
						cb.equal(roles.get("nombre"), rol));
				condiciones.add(cb.exists(conRol));
			}
			if (buscar != null) {
				String patron = "%" + escaparComodines(buscar.toLowerCase(Locale.ROOT)) + "%";
				condiciones.add(cb.or(cb.like(cb.lower(raiz.<String>get("nombre")), patron, '\\'),
						cb.like(cb.lower(raiz.<String>get("correo")), patron, '\\')));
			}
			return cb.and(condiciones.toArray(Predicate[]::new));
		};
	}

	/** Un % o _ escrito por el usuario se busca tal cual, no como comodin. */
	private static String escaparComodines(String texto) {
		return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}

}
