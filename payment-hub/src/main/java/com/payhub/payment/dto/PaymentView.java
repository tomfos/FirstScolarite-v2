package com.payhub.payment.dto;

import com.payhub.payment.Payment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Vue d'un paiement retournée aux applications clientes. */
public record PaymentView(
    UUID id,
    UUID applicationId,
    String reference,
    String method,
    BigDecimal amount,
    String currency,
    String status,
    String providerRef,
    String failureReason,
    String checkoutUrl,     // page de paiement hébergée (widget/iframe)
    String clientSecret,    // jeton de capacité à passer au widget pour ouvrir le checkout
    Instant createdAt,
    Instant updatedAt
) {
    public static PaymentView of(Payment p, String checkoutUrl) {
        return new PaymentView(p.id(), p.applicationId(), p.reference(), p.method(), p.amount(),
            p.currency(), p.status(), p.providerRef(), p.failureReason(), checkoutUrl,
            p.checkoutToken(), p.createdAt(), p.updatedAt());
    }
}
