package com.firstpay.partner.config;

import io.netty.resolver.DefaultAddressResolverGroup;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;

/**
 * Clients HTTP sortants du partner-service. Pour l'instant : appel server-to-server vers
 * transaction-service (initiation de paiement depuis la page payeur publique).
 *
 * <p><b>DNS :</b> on force le résolveur JVM par défaut ({@link DefaultAddressResolverGroup}).
 * Le résolveur DNS natif de Netty ne dialogue pas de façon fiable avec le DNS embarqué de Docker
 * (127.0.0.11) : la résolution des noms de services (ex. {@code transaction-service}) restait
 * bloquée sans erreur, faisant échouer l'initiation de paiement en timeout. Le résolveur JVM,
 * lui, fonctionne (comme {@code wget}/{@code getent} dans le conteneur). On ajoute aussi des
 * timeouts pour échouer vite plutôt que de pendre indéfiniment.
 */
@Configuration
public class WebClientConfig {

    @Bean
    WebClient transactionWebClient(@Value("${firstpay.transaction-service-uri:http://localhost:8080}") String baseUrl) {
        HttpClient httpClient = HttpClient.create()
            .resolver(DefaultAddressResolverGroup.INSTANCE)
            .option(io.netty.channel.ChannelOption.CONNECT_TIMEOUT_MILLIS, 5000)
            .responseTimeout(Duration.ofSeconds(10));
        return WebClient.builder()
            .baseUrl(baseUrl)
            .clientConnector(new ReactorClientHttpConnector(httpClient))
            .build();
    }
}
