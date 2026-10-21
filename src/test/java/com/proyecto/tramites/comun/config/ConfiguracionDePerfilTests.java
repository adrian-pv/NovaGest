package com.proyecto.tramites.comun.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;

/** Tarjeta 46: sin perfil explicito, o con una clave debil en prod, la aplicacion no arranca. */
class ConfiguracionDePerfilTests {

	private static final String CLAVE_BUENA = "k8Qz3vLw9XpR2mTnYb6HcJd5FgUa7SeN4oVi1WxZ0qE=";

	@Test
	void sinPerfilActivoNoArrancaYExplicaQueHacer() {
		assertThatThrownBy(() -> ConfiguracionDePerfil.validar(List.of(), CLAVE_BUENA))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("SPRING_PROFILES_ACTIVE=dev")
				.hasMessageContaining("SPRING_PROFILES_ACTIVE=prod");
	}

	@Test
	void unPerfilDesconocidoTampocoCuentaComoExplicito() {
		assertThatThrownBy(() -> ConfiguracionDePerfil.validar(List.of("produccion", "default"), CLAVE_BUENA))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("No hay perfil activo");
	}

	@ParameterizedTest
	@ValueSource(strings = { "dev", "test", "prod", "PROD", " prod " })
	void conUnPerfilConocidoArranca(String perfil) {
		assertThatCode(() -> ConfiguracionDePerfil.validar(List.of(perfil), CLAVE_BUENA)).doesNotThrowAnyException();
	}

	@Test
	void devYTestNoExigenLaClaveFuerteDeProduccion() {
		assertThatCode(() -> ConfiguracionDePerfil.validar(List.of("dev"), "dev-clave-corta")).doesNotThrowAnyException();
		assertThatCode(() -> ConfiguracionDePerfil.validar(List.of("test"), "clave-solo-para-pruebas-automaticas-0123456789"))
				.doesNotThrowAnyException();
		assertThatCode(() -> ConfiguracionDePerfil.validar(List.of("test", "dev"), "")).doesNotThrowAnyException();
	}

	@ParameterizedTest
	@ValueSource(strings = { "prod,dev", "dev,prod", "prod,test", "test,prod" })
	void prodNoSeCombinaConDevNiTest(String perfiles) {
		assertThatThrownBy(() -> ConfiguracionDePerfil.validar(List.of(perfiles.split(",")), CLAVE_BUENA))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("no se combina");
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = { "   " })
	void prodSinClaveNoArranca(String clave) {
		assertThatThrownBy(() -> ConfiguracionDePerfil.validar(List.of("prod"), clave))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("obligatoria");
	}

	@ParameterizedTest
	@ValueSource(strings = { "corta", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P", "1234567890123456789012345678901" })
	void prodConClaveCortaNoArranca(String clave) {
		assertThatThrownBy(() -> ConfiguracionDePerfil.validar(List.of("prod"), clave))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("demasiado corta");
	}

	@ParameterizedTest
	@ValueSource(strings = { "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "abababababababababababababababababababab",
			"abcdefabcdefabcdefabcdefabcdefabcdefabcdef" })
	void prodConClaveRepetitivaNoArranca(String clave) {
		assertThatThrownBy(() -> ConfiguracionDePerfil.validar(List.of("prod"), clave))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("repetitiva");
	}

	@ParameterizedTest
	@ValueSource(strings = { "ChangeMe-ChangeMe-8f3k2j9d0s7a6q5w4e1r", "mi-secret-key-para-el-servidor-9f8e7d6c5b4a",
			"clave-solo-para-pruebas-automaticas-0123456789", "Password-del-servidor-Zx9Qw8Er7Ty6" })
	void prodConClaveDeEjemploNoArranca(String clave) {
		assertThatThrownBy(() -> ConfiguracionDePerfil.validar(List.of("prod"), clave))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("ejemplo");
	}

	@Test
	void prodConClaveAleatoriaDeLaLongitudMinimaArranca() {
		assertThatCode(() -> ConfiguracionDePerfil.validar(List.of("prod"), "k8Qz3vLw9XpR2mTnYb6HcJd5FgUa7SeN"))
				.doesNotThrowAnyException();
	}

	@Test
	void elMensajeDeErrorNuncaIncluyeLaClave() {
		String clave = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		assertThatThrownBy(() -> ConfiguracionDePerfil.validar(List.of("prod"), clave))
				.satisfies(e -> assertThat(e.getMessage()).doesNotContain(clave));
	}

	// El componente real lee el perfil y la clave del Environment (incluida la clave sin resolver): se prueba el cableado

	private static void procesar(String perfiles, String... propiedades) {
		MockEnvironment entorno = new MockEnvironment();
		if (perfiles != null) {
			entorno.setActiveProfiles(perfiles.split(","));
		}
		for (String propiedad : propiedades) {
			String[] partes = propiedad.split("=", 2);
			entorno.setProperty(partes[0], partes[1]);
		}
		new ConfiguracionDePerfil().postProcessEnvironment(entorno, new SpringApplication());
	}

	@Test
	void elComponenteSeNiegaAArrancarSinPerfil() {
		assertThatThrownBy(() -> procesar(null, "app.jwt.secret=" + CLAVE_BUENA)).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("No hay perfil activo");
	}

	@Test
	void elComponenteSeNiegaAArrancarEnProdConClaveCorta() {
		assertThatThrownBy(() -> procesar("prod", "app.jwt.secret=corta")).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("demasiado corta");
	}

	@Test
	void elComponenteSeNiegaAArrancarEnProdSinClave() {
		assertThatThrownBy(() -> procesar("prod")).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("obligatoria");
	}

	@Test
	void sinJwtSecretLaReferenciaSinResolverSeTrataComoClaveAusente() {
		// Como en application.properties: app.jwt.secret=${JWT_SECRET} y JWT_SECRET no existe
		assertThatThrownBy(() -> procesar("prod", "app.jwt.secret=${JWT_SECRET}")).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("obligatoria");
	}

	@Test
	void elComponenteArrancaEnProdConClaveFuerte() {
		assertThatCode(() -> procesar("prod", "app.jwt.secret=" + CLAVE_BUENA)).doesNotThrowAnyException();
	}

	@Test
	void estaRegistradoParaCorrerAntesQueCualquierBean() throws Exception {
		try (var flujo = getClass().getResourceAsStream("/META-INF/spring.factories")) {
			assertThat(new String(flujo.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8))
					.contains("org.springframework.boot.EnvironmentPostProcessor=" + ConfiguracionDePerfil.class.getName());
		}
	}

	@Test
	void applicationPropertiesNoDeclaraPerfilPorDefectoYLeeElPerfilDeLaVariable() throws Exception {
		try (var flujo = getClass().getResourceAsStream("/application.properties")) {
			String texto = new String(flujo.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
			assertThat(texto).doesNotContain("spring.profiles.default");
			// Permite que SPRING_PROFILES_ACTIVE escrito en el archivo .env cuente como perfil explicito
			assertThat(texto).contains("spring.profiles.active=${SPRING_PROFILES_ACTIVE:}");
		}
	}

}
