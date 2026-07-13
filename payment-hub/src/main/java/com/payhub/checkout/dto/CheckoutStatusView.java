package com.payhub.checkout.dto;

import com.payhub.payment.Payment;

import java.util.UUID;

/** Statut renvoyé au payeur après une tentative de paiement. */
public record CheckoutStatusView(UUID paymentId, String status, String failureReason) {
    public static CheckoutStatusView of(Payment p) {
        return new CheckoutStatusView(p.id(), p.status(), p.failureReason());
    }
}
