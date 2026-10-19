package com.proyecto.tramites.usuarios.repository;

import com.proyecto.tramites.usuarios.entity.Usuario;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UsuarioRepository extends JpaRepository<Usuario, Long>, JpaSpecificationExecutor<Usuario> {

	/** Busca sin importar mayusculas y ignora los eliminados. Trae roles y permisos en una sola consulta. */
	@EntityGraph(attributePaths = { "roles", "roles.permisos" })
	Optional<Usuario> findByCorreoIgnoreCaseAndEliminadoEnIsNull(String correo);

	/** Para resolver los permisos en cada peticion: el token trae el id, los permisos salen de aqui. */
	@EntityGraph(attributePaths = { "roles", "roles.permisos" })
	Optional<Usuario> findConRolesYPermisosByIdAndEliminadoEnIsNull(Long id);

	/**
	 * Para iniciar sesion: bloquea la fila del usuario mientras dura la transaccion. Si alguien prueba claves
	 * en paralelo, cada intento espera su turno y el contador de fallos no se pierde (no se puede esquivar el
	 * bloqueo a fuerza de peticiones simultaneas).
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select u from Usuario u where lower(u.correo) = lower(:correo) and u.eliminadoEn is null")
	Optional<Usuario> bloquearPorCorreo(@Param("correo") String correo);

	boolean existsByCorreoIgnoreCaseAndEliminadoEnIsNull(String correo);

}
