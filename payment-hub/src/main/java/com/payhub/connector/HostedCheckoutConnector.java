package com.payhub.connector;

import com.payhub.provider.Provider;
import reactor.core.publisher.Mono;

/**
 * Connecteur dont le paiement se déroule sur une page hébergée par le PSP (ex. MPGS Hosted
 * Checkout). Le Hub crée une <b>session</b> côté serveur (les secrets restent serveur), la page
 * de checkout charge le script du PSP pour afficher le formulaire, puis le Hub <b>vérifie</b>
 * l'ordre côté serveur (source de vérité) au retour.
 */
public interface HostedCheckoutConnector {

    /**
     * Crée une session de paiement côté PSP.
     * @param returnUrl URL du Hub vers laquelle le PSP renvoie le payeur une fois terminé.
     */
    Mono<HostedSession> startSession(PaymentAttempt attempt, Provider provider, String returnUrl);

    /** Vérifie l'ordre côté PSP (au retour) et renvoie le statut autoritatif. */
    Mono<ChargeResult> verifyOrder(String orderId, Provider provider);

    /** Données que la page de checkout utilise pour afficher le formulaire hébergé du PSP. */
    record HostedSession(String provider, String scriptUrl, String sessionId) {}
}
