package com.payhub.payment;

import com.payhub.connector.ChargeResult;
import com.payhub.connector.PaymentConnectorRouter;
import com.payhub.method.PaymentMethodStore;
import com.payhub.provider.ProviderService;
import com.payhub.webhook.OutboundWebhookService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

/**
 * Finalise un paiement PENDING en interrogeant le PSP (statut autoritatif). Partagé par le
 * webhook entrant et la réconciliation planifiée : le webhook n'est qu'un signal « vérifie
 * maintenant » — on ne fait jamais confiance aveuglément à son contenu.
 */
@Service
public class PaymentFinalizer {

    private static final Logger log = LoggerFactory.getLogger(PaymentFinalizer.class);

    private final PaymentStore payments;
    private final PaymentEventStore events;
    private final PaymentConnectorRouter router;
    private final ProviderService providers;
    private final PaymentMethodStore methods;
    private final OutboundWebhookService notifier;

    public PaymentFinalizer(PaymentStore payments, PaymentEventStore events,
                            PaymentConnectorRouter router, ProviderService providers,
                            PaymentMethodStore methods, OutboundWebhookService notifier) {
        this.payments = payments;
        this.events = events;
        this.router = router;
        this.providers = providers;
        this.methods = methods;
        this.notifier = notifier;
    }

    public Mono<Payment> finalizeById(java.util.UUID paymentId) {
        return payments.findById(paymentId).flatMap(this::finalize);
    }

    public Mono<Payment> finalize(Payment p) {
        if (p.isFinal() || p.providerRef() == null || p.method() == null) {
            return Mono.just(p);
        }
        return methods.findByCode(p.method())
            .flatMap(m -> providers.resolve(m.providerCode()))
            .flatMap(provider -> router.forMethod(p.method())
                .map(c -> c.pollStatus(p.providerRef(), p.method(), provider))
                .orElse(Mono.just(ChargeResult.pending(p.providerRef()))))
            .flatMap(r -> r.isPending() ? Mono.just(p) : apply(p, r))
            .defaultIfEmpty(p);
    }

    private Mono<Payment> apply(Payment p, ChargeResult r) {
        log.info("Finalisation paiement {} -> {}", p.id(), r.status());
        return payments.applyChargeResult(p.id(), p.method(), r.status(), r.providerRef(), r.reason())
            .flatMap(updated -> events.append(p.id(), "STATUS_" + r.status(), "{}")
                .then(notifier.onFinal(updated))
                .thenReturn(updated));
    }
}
