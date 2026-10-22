package com.proyecto.tramites.divisas.repository;

import com.proyecto.tramites.divisas.entity.TipoCambio;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TipoCambioRepository extends JpaRepository<TipoCambio, Long> {

	boolean existsByFechaAndMoneda(LocalDate fecha, int moneda);

	/**
	 * Guarda una cotizacion y, si ya existe la de esa fecha y moneda, no hace nada. Es atomico en la base: si la tarea
	 * diaria y una peticion guardan la misma fila al mismo tiempo, la segunda espera a la primera y sigue sin error. Con
	 * "preguntar si existe y luego insertar" las dos preguntas daban que no y la segunda inserccion chocaba con el indice
	 * unico (uq_tipo_cambio_fecha_moneda). Devuelve 1 si inserto y 0 si ya estaba.
	 */
	@Modifying
	@Query(value = "INSERT INTO tipo_cambio (fecha, moneda, valor, fuente) VALUES (:fecha, :moneda, :valor, :fuente) "
			+ "ON CONFLICT (fecha, moneda) DO NOTHING", nativeQuery = true)
	int insertarSiNoExiste(@Param("fecha") LocalDate fecha, @Param("moneda") int moneda,
			@Param("valor") BigDecimal valor, @Param("fuente") String fuente);

	/** El valor de esa fecha o, si no hay, el ultimo anterior (fines de semana, feriados o Banguat caido). */
	Optional<TipoCambio> findFirstByMonedaAndFechaLessThanEqualOrderByFechaDesc(int moneda, LocalDate fecha);

}
