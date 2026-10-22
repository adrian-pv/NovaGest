package com.proyecto.spike;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;

/**
 * Peticiones contra Tomcat de verdad. MockMvc no lo arranca: no prueba el Tomcat que fija el pom ni el reenvio de los
 * errores a /error, donde un login mal formado acababa en 401.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
    properties = "app.jwt.secret=una-clave-de-prueba-de-al-menos-32-caracteres")
class ServidorRealTests {

    private static final HttpClient HTTP = HttpClient.newHttpClient();

    @LocalServerPort int puerto;

    private HttpRequest.Builder a(String ruta) {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + puerto + ruta));
    }

    private HttpResponse<String> enviar(HttpRequest.Builder req) throws Exception {
        return HTTP.send(req.build(), BodyHandlers.ofString());
    }

    private HttpResponse<String> login(String tipo, String cuerpo) throws Exception {
        return enviar(a("/api/auth/login").header("Content-Type", tipo).POST(BodyPublishers.ofString(cuerpo)));
    }

    @Test
    void tokenDelLoginAbreRutaProtegida() throws Exception {
        HttpResponse<String> login = login("application/json",
            "{\"correo\":\"ciudadano@demo.com\",\"clave\":\"clave123\"}");
        assertThat(login.statusCode()).isEqualTo(200);
        String token = JsonPath.read(login.body(), "$.accessToken");

        HttpResponse<String> yo = enviar(a("/api/yo").header("Authorization", "Bearer " + token));
        assertThat(yo.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<String>read(yo.body(), "$.usuario")).isEqualTo("ciudadano@demo.com");
    }

    @Test
    void loginMalFormadoEs400NoUnFalloDeAutenticacion() throws Exception {
        for (String cuerpo : new String[] {"{\"correo\":\"\",\"clave\":\"clave123\"}", "{\"correo\":", ""}) {
            HttpResponse<String> r = login("application/json", cuerpo);
            assertThat(r.statusCode()).as(cuerpo).isEqualTo(400);
            assertThat(r.headers().firstValue("WWW-Authenticate")).as(cuerpo).isEmpty();
        }
    }

    @Test
    void loginSinJsonEs415() throws Exception {
        assertThat(login("text/plain", "hola").statusCode()).isEqualTo(415);
    }

    @Test
    void permitirElReenvioDeErroresNoAbreNadaSinToken() throws Exception {
        assertThat(enviar(a("/api/yo")).statusCode()).isEqualTo(401);
        assertThat(enviar(a("/api/no-existe")).statusCode()).isEqualTo(401);
        assertThat(enviar(a("/error")).statusCode()).isEqualTo(401);
    }
}
