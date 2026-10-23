package com.proyecto.tramites.pagos.service;

import com.proyecto.tramites.comun.config.PagosProperties;
import com.proyecto.tramites.comun.excepcion.DatosInvalidosException;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * Guarda los comprobantes en disco. Reglas: solo PDF, JPG o PNG reconocidos por su contenido real; maximo
 * 5 MB; el nombre del archivo lo genera el servidor (el del cliente se ignora por completo, asi no hay
 * rutas manipuladas ni nombres peligrosos); y se calcula su hash SHA-256 para detectar alteraciones.
 */
@Component
public class ComprobanteAlmacen {

	private static final Logger LOG = LoggerFactory.getLogger(ComprobanteAlmacen.class);

	public static final long TAMANO_MAXIMO = 5L * 1024 * 1024;

	/** Lo que queda registrado de un archivo guardado. */
	public record Almacenado(String archivo, String hash, String tipoMime, long tamano) {
	}

	private final Path directorio;

	public ComprobanteAlmacen(PagosProperties propiedades) {
		this.directorio = Path.of(propiedades.directorio()).toAbsolutePath().normalize();
	}

	/** Valida y guarda el archivo. Lanza 400 si no es un comprobante valido y 413 si pesa mas de 5 MB. */
	public Almacenado guardar(MultipartFile archivo) {
		if (archivo == null || archivo.isEmpty()) {
			throw DatosInvalidosException.de("comprobante", "El archivo esta vacio");
		}
		if (archivo.getSize() > TAMANO_MAXIMO) {
			throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "El comprobante pesa mas de 5 MB");
		}
		byte[] contenido;
		try {
			contenido = archivo.getBytes();
		}
		catch (IOException e) {
			throw new UncheckedIOException("No se pudo leer el comprobante recibido", e);
		}
		TipoComprobante tipo = TipoComprobante.detectar(contenido).orElseThrow(
				() -> DatosInvalidosException.de("comprobante", "Debe ser un archivo PDF, JPG o PNG"));
		String nombre = UUID.randomUUID() + "." + tipo.extension();
		try {
			Files.createDirectories(directorio);
			Files.write(resolver(nombre), contenido, StandardOpenOption.CREATE_NEW);
		}
		catch (IOException e) {
			throw new UncheckedIOException("No se pudo guardar el comprobante", e);
		}
		return new Almacenado(nombre, sha256(contenido), tipo.tipoMime(), contenido.length);
	}

	/**
	 * Lee el archivo. Con dos instancias que sincronizan sus carpetas, un comprobante recien subido en la otra puede no
	 * haber llegado todavia: eso es un 409 con un mensaje claro (el pago existe, el archivo aun no), no un 500.
	 */
	public byte[] leer(String nombre) {
		try {
			return Files.readAllBytes(resolver(nombre));
		}
		catch (NoSuchFileException e) {
			LOG.warn("Comprobante {} no esta en la carpeta de esta instancia (sincronizacion pendiente o perdido)", nombre);
			throw new ResponseStatusException(HttpStatus.CONFLICT,
					"El comprobante todavia no esta disponible en este servidor. Si se acaba de subir, intenta de nuevo en unos segundos");
		}
		catch (IOException e) {
			throw new UncheckedIOException("No se pudo leer el comprobante guardado", e);
		}
	}

	/** Se usa si la base falla despues de guardar el archivo, para no dejar archivos sueltos. */
	public void borrar(String nombre) {
		try {
			Files.deleteIfExists(resolver(nombre));
		}
		catch (IOException e) {
			// no se puede hacer mas; el archivo queda sin referencia y se limpia a mano
		}
	}

	/** Defensa en profundidad: el nombre siempre debe quedar dentro de la carpeta de comprobantes. */
	private Path resolver(String nombre) {
		Path destino = directorio.resolve(nombre).normalize();
		if (!destino.startsWith(directorio)) {
			throw new IllegalArgumentException("Ruta de comprobante fuera de la carpeta permitida");
		}
		return destino;
	}

	private static String sha256(byte[] contenido) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(contenido));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256 no disponible", e);
		}
	}

}
