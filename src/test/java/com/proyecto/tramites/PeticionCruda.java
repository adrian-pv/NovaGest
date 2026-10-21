package com.proyecto.tramites;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Cliente HTTP minimo sobre un socket, para pruebas contra un servidor real que necesitan controlar cabeceras que los
 * clientes normales restringen o reescriben (Host) y simular lo que hace un proxy (X-Forwarded-*). Usa HTTP/1.0 para
 * no tener que decodificar respuestas por partes.
 */
final class PeticionCruda {

	record Respuesta(int estado, Map<String, String> cabeceras, String cuerpo) {

		/** Valor de una cabecera sin importar mayusculas, o null. */
		String cabecera(String nombre) {
			return cabeceras.get(nombre.toLowerCase());
		}

	}

	private PeticionCruda() {
	}

	static Respuesta enviar(int puerto, String metodo, String ruta, Map<String, String> cabeceras, String cuerpo)
			throws IOException {
		Map<String, String> todas = new LinkedHashMap<>();
		todas.put("Host", "127.0.0.1:" + puerto);
		todas.putAll(cabeceras);
		byte[] bytesCuerpo = cuerpo == null ? new byte[0] : cuerpo.getBytes(StandardCharsets.UTF_8);
		StringBuilder cabecera = new StringBuilder(metodo + " " + ruta + " HTTP/1.0\r\n");
		todas.forEach((k, v) -> cabecera.append(k).append(": ").append(v).append("\r\n"));
		if (cuerpo != null) {
			cabecera.append("Content-Type: application/json\r\n");
			cabecera.append("Content-Length: ").append(bytesCuerpo.length).append("\r\n");
		}
		cabecera.append("\r\n");

		try (Socket socket = new Socket("127.0.0.1", puerto)) {
			socket.setSoTimeout(20_000);
			socket.getOutputStream().write(cabecera.toString().getBytes(StandardCharsets.UTF_8));
			socket.getOutputStream().write(bytesCuerpo);
			socket.getOutputStream().flush();
			ByteArrayOutputStream recibido = new ByteArrayOutputStream();
			socket.getInputStream().transferTo(recibido);
			return interpretar(recibido.toString(StandardCharsets.UTF_8));
		}
	}

	private static Respuesta interpretar(String texto) {
		int corte = texto.indexOf("\r\n\r\n");
		String encabezado = corte < 0 ? texto : texto.substring(0, corte);
		String cuerpo = corte < 0 ? "" : texto.substring(corte + 4);
		String[] lineas = encabezado.split("\r\n");
		int estado = Integer.parseInt(lineas[0].split(" ")[1]);
		Map<String, String> cabeceras = new LinkedHashMap<>();
		for (int i = 1; i < lineas.length; i++) {
			int dosPuntos = lineas[i].indexOf(':');
			if (dosPuntos > 0) {
				cabeceras.put(lineas[i].substring(0, dosPuntos).trim().toLowerCase(),
						lineas[i].substring(dosPuntos + 1).trim());
			}
		}
		return new Respuesta(estado, cabeceras, cuerpo);
	}

}
