package com.payhub.connector;

import com.payhub.provider.Provider;
import reactor.core.publisher.Mono;

import java.util.Set;

/**
 * Point d'extension du Hub : un connecteur intègre un PSP (TrustPayWay, MPGS, SARA, RTGS…).
 *
 * <p>Ajouter un moyen de paiement « et autres » = fournir un nouveau bean implémentant cette
 * interface (déclarant les codes de moyens qu'il gère) + une ligne dans le catalogue. Aucune
 * autre partie du Hub ne change : {@link PaymentConnectorRouter} le découvre automatiquement.
 */
public interface PaymentConnector {

    /** Codes de moyens gérés par ce connecteur (ex. {@code {"orange","mtn"}} pour TrustPayWay). */
    Set<String> methods();

    /**
     * Vrai si le moyen exige une page hébergée par le PSP (ex. MPGS Hosted Checkout) affichée
     * dans le navigateur du payeur. Ces connecteurs ne se débitent pas en serveur→serveur : le
     * flux passe obligatoirement par le checkout (cf. {@link HostedCheckoutConnector}).
     */
    default boolean hosted() { return false; }

    /** Débite le payeur. Le provider fournit les credentials (déchiffrés) et le mode. */
    Mono<ChargeResult> charge(PaymentAttempt attempt, Provider provider);

    /**
     * Interroge le statut d'un paiement initié (mobile money PENDING). Utilisé par la
     * réconciliation quand le webhook n'est pas arrivé. Retourne un statut brut normalisé
     * en {@code SUCCESS | PENDING | FAILED} par le connecteur.
     */
    default Mono<ChargeResult> pollStatus(String providerRef, String method, Provider provider) {
        return Mono.just(ChargeResult.pending(providerRef));
    }
}
