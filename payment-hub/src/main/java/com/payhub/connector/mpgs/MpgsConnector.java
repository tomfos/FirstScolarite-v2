package com.payhub.connector.mpgs;

import com.payhub.connector.ChargeResult;
import com.payhub.connector.HostedCheckoutConnector;
import com.payhub.connector.PaymentAttempt;
import com.payhub.connector.PaymentConnector;
import com.payhub.provider.Provider;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.util.Set;

/**
 * Connecteur carte via <b>MPGS Hosted Checkout</b> (moyen {@code card}). C'est un connecteur
 * « hébergé » : le paiement se fait sur la page MPGS chargée dans le checkout, pas en
 * serveur→serveur. Le Hub crée la session puis vérifie l'ordre au retour.
 */
@Component
public class MpgsConnector implements PaymentConnector, HostedCheckoutConnector {

    private final MpgsClient client;

    public MpgsConnector(MpgsClient client) {
        this.client = client;
    }

    @Override
    public Set<String> methods() {
        return Set.of("card");
    }

    @Override
    public boolean hosted() {
        return true;
    }

    @Override
    public Mono<ChargeResult> charge(PaymentAttempt attempt, Provider provider) {
        // Non applicable : la carte MPGS passe par le checkout hébergé, jamais par un débit direct.
        return Mono.just(ChargeResult.failed("La carte (MPGS) nécessite le checkout hébergé"));
    }

    @Override
    @CircuitBreaker(name = "mpgs-connector")
    public Mono<HostedSession> startSession(PaymentAttempt attempt, Provider provider, String returnUrl) {
        return client.createSession(
            attempt.paymentId().toString(),
            attempt.amount().toPlainString(),
            attempt.currency(),
            attempt.reference(),
            returnUrl,
            provider.credentials());
    }

    @Override
    @CircuitBreaker(name = "mpgs-connector")
    public Mono<ChargeResult> verifyOrder(String orderId, Provider provider) {
        return client.retrieveOrder(orderId, provider.credentials());
    }
}
