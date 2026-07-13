package com.payhub.connector.trustpayway;

import com.payhub.connector.ChargeResult;
import com.payhub.connector.PaymentAttempt;
import com.payhub.connector.PaymentConnector;
import com.payhub.provider.Provider;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.util.Set;

/**
 * Connecteur TrustPayWay : Orange Money ({@code orange}) et MTN MoMo ({@code mtn}).
 * Le code du moyen sert directement de « network » côté agrégateur.
 */
@Component
public class TrustPayWayConnector implements PaymentConnector {

    private final TrustPayWayClient client;

    public TrustPayWayConnector(TrustPayWayClient client) {
        this.client = client;
    }

    @Override
    public Set<String> methods() {
        return Set.of("orange", "mtn");
    }

    @Override
    @CircuitBreaker(name = "trustpayway-connector")
    public Mono<ChargeResult> charge(PaymentAttempt attempt, Provider provider) {
        return client.initiate(attempt, attempt.method(), provider.credentials());
    }

    @Override
    public Mono<ChargeResult> pollStatus(String providerRef, String method, Provider provider) {
        return client.status(method, providerRef, provider.credentials());
    }
}
