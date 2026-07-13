package com.payhub.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.payhub.application.Application;
import com.payhub.method.MethodService;
import com.payhub.payment.dto.CreatePaymentRequest;
import com.payhub.payment.dto.PaymentView;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Map;
import java.util.UUID;

/**
 * Cas d'usage des paiements côté application cliente : création (idempotente), débit immédiat
 * si le moyen est fourni, consultation. Le moyen demandé doit être activé pour l'application.
 */
@Service
public class PaymentService {

    private final PaymentStore store;
    private final PaymentEventStore events;
    private final PaymentOrchestrator orchestrator;
    private final MethodService methods;
    private final ObjectMapper json;
    private final String publicBaseUrl;

    public PaymentService(PaymentStore store, PaymentEventStore events, PaymentOrchestrator orchestrator,
                          MethodService methods, ObjectMapper json,
                          @Value("${payhub.public-base-url}") String publicBaseUrl) {
        this.store = store;
        this.events = events;
        this.orchestrator = orchestrator;
        this.methods = methods;
        this.json = json;
        this.publicBaseUrl = publicBaseUrl;
    }

    public Mono<PaymentView> create(Application app, CreatePaymentRequest req, String idempotencyKey) {
        String key = (idempotencyKey != null && !idempotencyKey.isBlank())
            ? idempotencyKey : UUID.randomUUID().toString();

        // Idempotence : une même clé pour une même application renvoie le paiement existant.
        return store.findByIdempotency(app.id(), key)
            .map(this::view)
            .switchIfEmpty(Mono.defer(() -> createNew(app, req, key)));
    }

    private Mono<PaymentView> createNew(Application app, CreatePaymentRequest req, String key) {
        String method = blankToNull(req.method());
        Mono<Void> methodCheck = method == null ? Mono.empty()
            : methods.isOffered(app.id(), method).flatMap(ok -> ok ? Mono.empty()
                : Mono.error(new IllegalArgumentException("Moyen « " + method + " » non disponible pour cette application")));

        String checkoutToken = UUID.randomUUID().toString().replace("-", "");
        Payment payment = new Payment(
            UUID.randomUUID(), app.id(), blankToNull(req.reference()), method,
            req.amount(), req.currency() != null ? req.currency() : "XAF",
            "PENDING", null, blankToNull(req.payerMsisdn()), blankToNull(req.payerName()),
            key, req.returnUrl() != null ? req.returnUrl() : app.returnUrl(),
            toJson(req.metadata()), null, checkoutToken, null, null);

        return methodCheck
            .then(store.insert(payment))
            .flatMap(saved -> events.append(saved.id(), "CREATED", "{}").thenReturn(saved))
            .flatMap(saved -> (method != null && saved.payerMsisdn() != null)
                ? orchestrator.charge(saved)      // moyen + payeur fournis : on débite tout de suite
                : Mono.just(saved))               // sinon : en attente du checkout
            .map(this::view);
    }

    public Mono<PaymentView> get(UUID id, UUID applicationId) {
        return store.findByIdForApp(id, applicationId).map(this::view);
    }

    public Flux<PaymentView> list(UUID applicationId, int limit) {
        return store.listForApp(applicationId, limit).map(this::view);
    }

    private PaymentView view(Payment p) {
        String url = publicBaseUrl + "/checkout/" + p.id()
            + (p.checkoutToken() != null ? "?cs=" + p.checkoutToken() : "");
        return PaymentView.of(p, url);
    }

    private String toJson(Map<String, Object> m) {
        try { return json.writeValueAsString(m != null ? m : Map.of()); }
        catch (Exception e) { return "{}"; }
    }

    private static String blankToNull(String s) { return (s == null || s.isBlank()) ? null : s; }
}
