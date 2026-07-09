package com.firstpay.payment.connector;

import com.firstpay.payment.connector.http.HttpPspClient;
import com.firstpay.payment.dto.PaymentResult;
import com.firstpay.payment.dto.TransactionCreatedEvent;
import com.firstpay.payment.infra.MpgsConfigProvider;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/**
 * Connecteur carte bancaire. Si MPGS (Hosted Checkout) est activé, le paiement est piloté par le
 * navigateur (redirection Mastercard) : on renvoie {@code awaitingCheckout} sans charge serveur.
 * Sinon, HTTP acquéreur configurable ou simulation dev.
 */
@Component
public class CardConnector implements PaymentConnector {
    private final HttpPspClient psp;
    private final MpgsConfigProvider mpgs;
    private final boolean simulationEnabled;

    public CardConnector(HttpPspClient psp, MpgsConfigProvider mpgs,
                         @Value("${firstpay.payment.simulation-enabled:false}") boolean simulationEnabled) {
        this.psp = psp;
        this.mpgs = mpgs;
        this.simulationEnabled = simulationEnabled;
    }

    @Override public String method() { return "card"; }

    @Override
    @CircuitBreaker(name = "card-connector")
    public Mono<PaymentResult> charge(TransactionCreatedEvent event) {
        return mpgs.get().flatMap(cfg -> cfg.isReady()
            ? Mono.just(PaymentResult.awaitingCheckout(event))
            : chargeServerSide(event));
    }

    private Mono<PaymentResult> chargeServerSide(TransactionCreatedEvent event) {
        return psp.chargeCard(event)
            .onErrorResume(IllegalStateException.class, e ->
                simulationEnabled
                    ? SimulatedConnector.simulate(event, "card")
                    : Mono.just(PaymentResult.failed(event, e.getMessage())));
    }
}
