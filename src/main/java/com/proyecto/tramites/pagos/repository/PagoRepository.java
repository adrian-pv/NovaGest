package com.proyecto.tramites.pagos.repository;

import com.proyecto.tramites.pagos.entity.EstadoPago;
import com.proyecto.tramites.pagos.entity.Pago;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PagoRepository extends JpaRepository<Pago, Long>, JpaSpecificationExecutor<Pago> {

	boolean existsByTramiteIdAndEstado(Long tramiteId, EstadoPago estado);

	/**
	 * Bloquea la fila del pago mientras dura la transaccion. Resolver un pago lee su estado y luego lo cambia: sin este
	 * bloqueo, dos personas que lo resuelven a la vez leen PENDIENTE las dos y la segunda decision pisa a la primera. Con
	 * el, la segunda espera, ve el pago ya resuelto y recibe 409. Mismo patron que TramiteRepository.bloquearPorId.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from Pago p where p.id = :id")
	Optional<Pago> bloquearPorId(@Param("id") Long id);

}
