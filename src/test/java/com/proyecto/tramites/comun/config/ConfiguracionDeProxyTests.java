package com.proyecto.tramites.comun.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

/** Tarjeta 45: la aplicacion se niega a arrancar con una configuracion de proxy que permita falsificar la IP. */
class ConfiguracionDeProxyTests {

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = { "none", "NONE", " none ", "  " })
	void sinProxyConfiguradoSeAceptaConCualquierListaDeProxies(String estrategia) {
		assertThatCode(() -> ConfiguracionDeProxy.validar(estrategia, "")).doesNotThrowAnyException();
		assertThatCode(() -> ConfiguracionDeProxy.validar(estrategia, ".*")).doesNotThrowAnyException();
	}

	@ParameterizedTest
	@ValueSource(strings = { "127\\.0\\.0\\.1", "127[.]0[.]0[.]1", "127\\.0\\.0\\.1|0:0:0:0:0:0:0:1|::1",
			"172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}", "10\\.0\\.0\\.5", "192\\.168\\.1\\.\\d+",
			"100\\.87\\.27\\.107" })
	void conNativeSeAceptanLasExpresionesLimitadasAUnProxy(String proxies) {
		assertThatCode(() -> ConfiguracionDeProxy.validar("native", proxies)).doesNotThrowAnyException();
		assertThatCode(() -> ConfiguracionDeProxy.validar("NATIVE", proxies)).doesNotThrowAnyException();
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = { "   " })
	void nativeSinProxiesDeConfianzaNoArranca(String proxies) {
		assertThatThrownBy(() -> ConfiguracionDeProxy.validar("native", proxies))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("PROXIES_CONFIANZA");
	}

	@ParameterizedTest
	@ValueSource(strings = { ".*", ".+", "\\d+\\.\\d+\\.\\d+\\.\\d+", "[0-9.]+", "(10|203)\\..*", "\\S+",
			"(127\\.0\\.0\\.1|.*)", "8\\.8\\..*", "^.*$" })
	void nativeConUnaExpresionQueAceptaDireccionesPublicasNoArranca(String proxies) {
		assertThatThrownBy(() -> ConfiguracionDeProxy.validar("native", proxies))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("demasiado amplia");
	}

	@Test
	void unaExpresionRegularMalFormadaNoArranca() {
		assertThatThrownBy(() -> ConfiguracionDeProxy.validar("native", "127(\\.0"))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("no es una expresion regular valida");
	}

	@ParameterizedTest
	@ValueSource(strings = { "framework", "FRAMEWORK", " framework " })
	void frameworkEstaProhibidoPorqueConfiaEnCualquierOrigen(String estrategia) {
		assertThatThrownBy(() -> ConfiguracionDeProxy.validar(estrategia, "127\\.0\\.0\\.1"))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("prohibido");
	}

	@ParameterizedTest
	@ValueSource(strings = { "nativo", "true", "si", "tomcat" })
	void unValorDesconocidoNoArranca(String estrategia) {
		assertThatThrownBy(() -> ConfiguracionDeProxy.validar(estrategia, "127\\.0\\.0\\.1"))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("no valido");
	}

	@Test
	void elMensajeDeErrorNoRevelaLaConfiguracionCompleta() {
		assertThatThrownBy(() -> ConfiguracionDeProxy.validar("native", "(secreto-interno|.*)"))
				.isInstanceOf(IllegalStateException.class).hasMessageNotContaining("secreto-interno");
	}

}
