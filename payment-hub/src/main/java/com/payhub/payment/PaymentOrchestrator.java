package com.payhub.payment;

import com.payhub.connector.ChargeResult;
import com.payhub.connector.PaymentAttempt;
import com.payhub.connector.PaymentConnector;
import com.payhub.connector.PaymentConnectorRouter;
import com.payhub.connector.SimulatedCharge;
import com.payhub.method.PaymentMethodStore;
import com.payhub.provider.Provider;
import com.payhub.provider.ProviderService;
import com.payhub.webhook.OutboundWebhookService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Duration;

/**
 * Oriente un paiement vers le bon connecteur et applique le résultat. Garantit qu'un même
 * paiement n'est débité qu'une fois (verrou Redis) : un rejeu ne re-débite jamais le payeur.
 * Si le provider d'un moyen n'est pas prêt, bascule sur la simulation (si activée) ou échoue.
 */
@Service
public class PaymentOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(PaymentOrchestrator.class);
    private static final Duration CHARGE_LOCK_TTL = Duration.ofHours(1);

    private final PaymentConnectorRouter router;
    private final ProviderService providers;
    private final PaymentMethodStore methods;
    private final PaymentStore paymentStore;
    private final PaymentEventStore events;
    private final OutboundWebhookService notifier;
    private final ReactiveStringRedisTemplate redis;
    private final String publicBaseUrl;
    private final boolean simulationEnabled;

    public PaymentOrchestrator(PaymentConnectorRouter router, ProviderService providers,
                               PaymentMethodStore methods, PaymentStore paymentStore,
                               PaymentEventStore events, OutboundWebhookService notifier,
                               ReactiveStringRedisTemplate redis,
                               @Value("${payhub.public-base-url}") String publicBaseUrl,
                               @Value("${payhub.payment.simulation-enabled:true}") boolean simulationEnabled) {
        this.router = router;
        this.providers = providers;
        this.methods = methods;
        this.paymentStore = paymentStore;
        this.events = events;
        this.notifier = notifier;
        this.redis = redis;
        this.publicBaseUrl = publicBaseUrl;
        this.simulationEnabled = simulationEnabled;
    }

    /** Débite le payeur pour ce paiement (moyen déjà choisi). Idempotent. */
    public Mono<Payment> charge(Payment payment) {
        // Moyen hébergé (ex. carte MPGS) : jamais de débit direct, le flux passe par le checkout.
        if (router.forMethod(payment.method()).map(PaymentConnector::hosted).orElse(false)) {
            return Mono.just(payment);
        }
        String lockKey = "payment:charged:" + payment.id();
        return redis.opsForValue().setIfAbsent(lockKey, "1", CHARGE_LOCK_TTL)
            .flatMap(acquired -> Boolean.TRUE.equals(acquired)
                ? doCharge(payment).onErrorResume(e -> releaseAndFail(lockKey, payment, e))
                : paymentStore.findById(payment.id()));   // déjà en cours / traité : on ne re-débite pas
    }

    private Mono<Payment> doCharge(Payment payment) {
        return methods.findByCode(payment.method())
            .switchIfEmpty(Mono.error(new IllegalStateException("Moyen inconnu : " + payment.method())))
            .flatMap(m -> providers.resolve(m.providerCode()))
            .switchIfEmpty(Mono.error(new IllegalStateException("Provider introuvable pour " + payment.method())))
            .flatMap(provider -> {
                PaymentAttempt attempt = buildAttempt(payment, provider.code());
                Mono<ChargeResult> result = router.forMethod(payment.method())
                    .filter(c -> provider.isReady())
                    .map(c -> c.charge(attempt, provider))
                    .orElseGet(() -> fallback(payment, provider));
                return result.flatMap(r -> apply(payment, r));
            });
    }

    private Mono<ChargeResult> fallback(Payment payment, Provider provider) {
        if (simulationEnabled) {
            log.info("Provider {} non prêt — simulation du débit pour paiement {}", provider.code(), payment.id());
            return SimulatedCharge.of(buildAttempt(payment, provider.code()));
        }
        return Mono.just(ChargeResult.failed("Provider « " + provider.code() + " » non configuré"));
    }

    /** Applique un résultat obtenu hors du chemin de débit (ex. vérification MPGS au retour). */
    public Mono<Payment> settle(Payment payment, ChargeResult r) {
        return apply(payment, r);
    }

    private Mono<Payment> apply(Payment payment, ChargeResult r) {
        return paymentStore.applyChargeResult(payment.id(), payment.method(), r.status(), r.providerRef(), r.reason())
            .flatMap(updated -> events.append(payment.id(), "PSP_" + r.status(),
                    "{\"providerRef\":\"" + safe(r.providerRef()) + "\",\"reason\":\"" + safe(r.reason()) + "\"}")
                .then(notifier.onFinal(updated))     // notifie l'app cliente si statut final
                .thenReturn(updated));
    }

    private Mono<Payment> releaseAndFail(String lockKey, Payment payment, Throwable e) {
        log.error("Échec débit paiement {} : {}", payment.id(), e.getMessage());
        return redis.delete(lockKey)   // libère le verrou : une nouvelle tentative sera possible
            .then(apply(payment, ChargeResult.failed("Erreur interne : " + e.getMessage())));
    }

    private PaymentAttempt buildAttempt(Payment p, String providerCode) {
        String notifyUrl = publicBaseUrl + "/webhooks/" + providerCode + "/" + p.method();
        return new PaymentAttempt(p.id(), p.method(), p.amount(), p.currency(),
            p.payerMsisdn(), p.payerName(), p.reference(), notifyUrl);
    }

    private static String safe(String v) { return v == null ? "" : v.replace("\"", "'"); }
}
