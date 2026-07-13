package com.payhub.checkout.dto;

import com.payhub.connector.HostedCheckoutConnector.HostedSession;
import com.payhub.payment.Payment;

/**
 * Réponse au clic « Payer » sur le checkout.
 * <ul>
 *   <li>Moyen direct (mobile money, wallet SARA) : {@code status} = SUCCESS/PENDING/FAILED.</li>
 *   <li>Moyen hébergé (carte MPGS) : {@code status} = HOSTED + {@code hosted} (script + session)
 *       que la page charge pour afficher le formulaire du PSP.</li>
 * </ul>
 */
public record CheckoutPayResponse(String status, String failureReason, Hosted hosted) {

    public record Hosted(String provider, String scriptUrl, String sessionId) {}

    public static CheckoutPayResponse of(Payment p) {
        return new CheckoutPayResponse(p.status(), p.failureReason(), null);
    }

    public static CheckoutPayResponse hosted(HostedSession s) {
        return new CheckoutPayResponse("HOSTED", null, new Hosted(s.provider(), s.scriptUrl(), s.sessionId()));
    }
}
