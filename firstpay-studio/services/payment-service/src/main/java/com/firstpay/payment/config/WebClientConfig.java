package com.firstpay.payment.config;

import io.netty.resolver.DefaultAddressResolverGroup;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;

@Configuration
public class WebClientConfig {

    /**
     * On force le résolveur DNS de la JVM ({@link DefaultAddressResolverGroup}) : le résolveur
     * natif de Netty ne dialogue pas de façon fiable avec le DNS embarqué de Docker (127.0.0.11),
     * ce qui faisait pendre les appels internes vers partner-service. + timeouts pour échouer vite.
     */
    private static HttpClient httpClient() {
        return HttpClient.create()
            .resolver(DefaultAddressResolverGroup.INSTANCE)
            .option(io.netty.channel.ChannelOption.CONNECT_TIMEOUT_MILLIS, 5000)
            .responseTimeout(Duration.ofSeconds(15));
    }

    /**
     * Client vers partner-service. Injecte X-Internal-Token : les endpoints {@code /internal/**}
     * (dont {@code /internal/aggregator-config}, qui indique si TrustPayWay est activé) sont
     * protégés par ce token — sans lui, partner-service répond 403 et l'agrégateur reste vu comme
     * désactivé (paiements en simulation).
     */
    @Bean
    @Qualifier("partner")
    WebClient partnerWebClient(@Value("${firstpay.partner-service-uri:http://localhost:8080}") String baseUrl,
                              @Value("${firstpay.internal-token:}") String internalToken) {
        WebClient.Builder b = WebClient.builder()
            .baseUrl(baseUrl)
            .clientConnector(new ReactorClientHttpConnector(httpClient()));
        if (internalToken != null && !internalToken.isBlank()) {
            b = b.defaultHeader("X-Internal-Token", internalToken);
        }
        return b.build();
    }

    @Bean
    @Qualifier("trustpayway")
    WebClient trustPayWayWebClient() {
        return WebClient.builder()
            .clientConnector(new ReactorClientHttpConnector(httpClient()))
            .build();
    }

    /** Client MPGS (Mastercard) : URL absolue par appel, gros buffer pour les réponses order détaillées. */
    @Bean
    @Qualifier("mpgs")
    WebClient mpgsWebClient() {
        return WebClient.builder()
            .clientConnector(new ReactorClientHttpConnector(httpClient()))
            .codecs(c -> c.defaultCodecs().maxInMemorySize(512 * 1024))
            .build();
    }

    /**
     * Client vers transaction-service (server-to-server, hors gateway). Sert au Hosted Checkout MPGS
     * à relire le montant/tenant faisant autorité d'une transaction avant de créer la session.
     */
    @Bean
    @Qualifier("transaction")
    WebClient transactionWebClient(@Value("${firstpay.transaction-service-uri:http://localhost:8080}") String baseUrl) {
        return WebClient.builder()
            .baseUrl(baseUrl)
            .clientConnector(new ReactorClientHttpConnector(httpClient()))
            .build();
    }
}
