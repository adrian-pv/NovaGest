package com.proyecto.tramites.usuarios.repository;

import com.proyecto.tramites.usuarios.entity.Rol;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RolRepository extends JpaRepository<Rol, Long> {

	@EntityGraph(attributePaths = "permisos")
	Optional<Rol> findByNombre(String nombre);

	/** Tarjeta 12: todos los roles con sus permisos, ordenados por nombre. */
	@EntityGraph(attributePaths = "permisos")
	List<Rol> findAllByOrderByNombreAsc();

	@EntityGraph(attributePaths = "permisos")
	Optional<Rol> findConPermisosById(Long id);

	/** Para asignar roles a un usuario a partir de sus nombres. */
	@EntityGraph(attributePaths = "permisos")
	List<Rol> findByNombreIn(Collection<String> nombres);

	boolean existsByNombreIgnoreCase(String nombre);

	boolean existsByNombreIgnoreCaseAndIdNot(String nombre, Long id);

	/** Cuantos usuarios (incluidos los eliminados de forma logica) tienen el rol. Si hay alguno no se puede borrar. */
	@Query(value = "SELECT count(*) FROM usuario_rol WHERE rol_id = :rolId", nativeQuery = true)
	long contarUsuariosConRol(@Param("rolId") Long rolId);

}
