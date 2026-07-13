package com.payhub.checkout;

import com.payhub.application.ApplicationStore;
import com.payhub.checkout.dto.CheckoutPayResponse;
import com.payhub.checkout.dto.CheckoutStatusView;
import com.payhub.checkout.dto.CheckoutView;
import com.payhub.connector.HostedCheckoutConnector;
import com.payhub.connector.PaymentAttempt;
import com.payhub.connector.PaymentConnector;
import com.payhub.connector.PaymentConnectorRouter;
import com.payhub.method.MethodService;
import com.payhub.method.PaymentMethodStore;
import com.payhub.payment.Payment;
import com.payhub.payment.PaymentOrchestrator;
import com.payhub.payment.PaymentStore;
import com.payhub.provider.ProviderService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Page de paiement hébergée. Résout un checkout (id + jeton de capacité) et traite le choix
 * du payeur. Revalide TOUT côté serveur (moyen autorisé, montant figé). Gère deux familles de
 * moyens : <b>directs</b> (débit serveur→serveur) et <b>hébergés</b> (page PSP, ex. carte MPGS).
 */
@Service
public class CheckoutService {

    private final PaymentStore payments;
    private final ApplicationStore applications;
    private final MethodService methods;
    private final PaymentMethodStore methodCatalog;
    private final ProviderService providers;
    private final PaymentConnectorRouter router;
    private final PaymentOrchestrator orchestrator;
    private final String publicBaseUrl;

    public CheckoutService(PaymentStore payments, ApplicationStore applications, MethodService methods,
                           PaymentMethodStore methodCatalog, ProviderService providers,
                           PaymentConnectorRouter router, PaymentOrchestrator orchestrator,
                           @Value("${payhub.public-base-url}") String publicBaseUrl) {
        this.payments = payments;
        this.applications = applications;
        this.methods = methods;
        this.methodCatalog = methodCatalog;
        this.providers = providers;
        this.router = router;
        this.orchestrator = orchestrator;
        this.publicBaseUrl = publicBaseUrl;
    }

    public Mono<CheckoutView> resolve(UUID paymentId, String token) {
        return payment(paymentId, token).flatMap(p ->
            applications.findById(p.applicationId()).flatMap(app ->
                methods.offeredFor(p.applicationId()).collectList().map(opts ->
                    new CheckoutView(p.id(), p.reference(), p.amount(), p.currency(), p.status(),
                        new CheckoutView.Branding(app.name(), app.brandColor(), app.logoUrl()),
                        opts, p.returnUrl()))));
    }

    public Mono<CheckoutPayResponse> pay(UUID paymentId, String token, String method,
                                         String payerMsisdn, String payerName) {
        return payment(paymentId, token).flatMap(p -> {
            if (p.isFinal()) return Mono.just(CheckoutPayResponse.of(p));
            return methods.isOffered(p.applicationId(), method).flatMap(ok -> {
                if (!ok) return Mono.error(new IllegalArgumentException("Moyen « " + method + " » non disponible"));
                PaymentConnector connector = router.forMethod(method).orElse(null);
                return (connector != null && connector.hosted())
                    ? startHosted(p, method, payerMsisdn, payerName, connector)
                    : payments.setPayerAndMethod(p.id(), method, payerMsisdn, payerName)
                        .flatMap(orchestrator::charge)
                        .map(CheckoutPayResponse::of);
            });
        });
    }

    /** Moyen hébergé : crée la session PSP et renvoie les infos d'affichage à la page. */
    private Mono<CheckoutPayResponse> startHosted(Payment p, String method, String msisdn,
                                                  String payerName, PaymentConnector connector) {
        String returnUrl = publicBaseUrl + "/checkout/" + p.id() + "/return?cs=" + p.checkoutToken();
        return payments.setPayerAndMethod(p.id(), method, msisdn, payerName)
            .flatMap(updated -> methodCatalog.findByCode(method)
                .flatMap(m -> providers.resolve(m.providerCode()))
                .flatMap(provider -> ((HostedCheckoutConnector) connector)
                    .startSession(attempt(updated), provider, returnUrl)
                    .map(CheckoutPayResponse::hosted)));
    }

    /** Retour du payeur depuis la page PSP : vérifie l'ordre (source de vérité) et finalise. */
    public Mono<Payment> completeHosted(UUID paymentId, String token) {
        return payment(paymentId, token).flatMap(p -> {
            if (p.isFinal()) return Mono.just(p);
            PaymentConnector connector = router.forMethod(p.method()).orElse(null);
            if (!(connector instanceof HostedCheckoutConnector hosted)) return Mono.just(p);
            return methodCatalog.findByCode(p.method())
                .flatMap(m -> providers.resolve(m.providerCode()))
                .flatMap(provider -> hosted.verifyOrder(p.id().toString(), provider))
                .flatMap(r -> orchestrator.settle(p, r));
        });
    }

    public Mono<CheckoutStatusView> status(UUID paymentId, String token) {
        return payment(paymentId, token).map(CheckoutStatusView::of);
    }

    private PaymentAttempt attempt(Payment p) {
        return new PaymentAttempt(p.id(), p.method(), p.amount(), p.currency(),
            p.payerMsisdn(), p.payerName(), p.reference(), null);
    }

    private Mono<Payment> payment(UUID paymentId, String token) {
        if (token == null || token.isBlank()) {
            return Mono.error(new NoSuchElementException("Jeton de checkout requis"));
        }
        return payments.findByIdAndToken(paymentId, token)
            .switchIfEmpty(Mono.error(new NoSuchElementException("Checkout introuvable")));
    }
}
