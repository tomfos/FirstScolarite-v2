package com.payhub.connector.sara;

import com.payhub.connector.ChargeResult;
import com.payhub.connector.PaymentAttempt;
import com.payhub.connector.PaymentConnector;
import com.payhub.connector.SimulatedCharge;
import com.payhub.provider.Provider;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.util.Map;
import java.util.Set;

/**
 * Connecteur <b>SARA</b> (moyen {@code sara}) : débit du wallet du payeur en serveur→serveur
 * (init_wallet_withdrawal → PENDING → get-status). Repli simulé tant que le provider n'est pas
 * complètement configuré ({@code baseUrl}, {@code username}, {@code password}).
 */
@Component
public class SaraConnector implements PaymentConnector {

    private final SaraClient client;

    public SaraConnector(SaraClient client) {
        this.client = client;
    }

    @Override
    public Set<String> methods() {
        return Set.of("sara");
    }

    @Override
    @CircuitBreaker(name = "sara-connector")
    public Mono<ChargeResult> charge(PaymentAttempt attempt, Provider provider) {
        Map<String, String> c = provider.credentials();
        if (c.get("baseUrl") == null || c.get("username") == null || c.get("password") == null) {
            return SimulatedCharge.of(attempt);
        }
        return client.initWithdrawal(attempt, c);
    }

    @Override
    public Mono<ChargeResult> pollStatus(String providerRef, String method, Provider provider) {
        return client.status(providerRef, provider.credentials());
    }
}
