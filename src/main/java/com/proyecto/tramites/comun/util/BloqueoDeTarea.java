package com.proyecto.tramites.comun.util;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Hace que una tarea programada corra en UNA sola instancia aunque varias compartan la misma base. Usa un candado
 * consultivo de PostgreSQL (pg_try_advisory_lock): quien lo obtiene ejecuta la tarea; quien no, la omite sin esperar.
 * El candado es de sesion y se suelta al terminar o, si la instancia se cae, cuando la base cierra su conexion; no
 * puede quedar tomado para siempre. No crea tablas ni migraciones.
 * <p>
 * Es un seguro frente a un error de configuracion (dos instancias con la tarea activa), no una garantia de "exactamente
 * una vez": si una instancia termina antes de que la otra empiece, la segunda tambien la corre. Las tareas deben ser
 * idempotentes (la de tipos de cambio lo es: lee primero lo guardado).
 */
@Component
public class BloqueoDeTarea {

	private static final Logger LOG = LoggerFactory.getLogger(BloqueoDeTarea.class);

	private final JdbcTemplate jdbc;

	public BloqueoDeTarea(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** Ejecuta la tarea si nadie mas tiene el candado {@code clave}. Devuelve si la ejecuto esta instancia. */
	public boolean ejecutarSiLibre(long clave, Runnable tarea) {
		Boolean ejecutada = jdbc.execute((Connection conexion) -> {
			if (!tomar(conexion, clave)) {
				return false;
			}
			try {
				tarea.run();
				return true;
			}
			finally {
				soltar(conexion, clave);
			}
		});
		return Boolean.TRUE.equals(ejecutada);
	}

	private static boolean tomar(Connection conexion, long clave) throws SQLException {
		try (PreparedStatement consulta = conexion.prepareStatement("select pg_try_advisory_lock(?)")) {
			consulta.setLong(1, clave);
			try (ResultSet resultado = consulta.executeQuery()) {
				return resultado.next() && resultado.getBoolean(1);
			}
		}
	}

	private static void soltar(Connection conexion, long clave) {
		try (PreparedStatement consulta = conexion.prepareStatement("select pg_advisory_unlock(?)")) {
			consulta.setLong(1, clave);
			consulta.execute();
		}
		catch (SQLException e) {
			// La conexion vuelve al pool con su sesion viva: sin soltarlo, el candado seguiria tomado
			LOG.warn("No se pudo soltar el candado {}: {}", clave, e.getMessage());
			try (PreparedStatement todos = conexion.prepareStatement("select pg_advisory_unlock_all()")) {
				todos.execute();
			}
			catch (SQLException otro) {
				LOG.error("No se pudieron soltar los candados de la sesion: {}", otro.getMessage());
			}
		}
	}

}
