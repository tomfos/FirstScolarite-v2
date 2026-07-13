package com.payhub.payment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Un encaissement traité par le Hub pour le compte d'une application cliente. */
public record Payment(
    UUID id,
    UUID applicationId,
    String reference,
    String method,
    BigDecimal amount,
    String currency,
    String status,          // PENDING | SUCCESS | FAILED | REFUNDED
    String providerRef,
    String payerMsisdn,
    String payerName,
    String idempotencyKey,
    String returnUrl,
    String metadata,        // JSON (texte)
    String failureReason,
    String checkoutToken,   // jeton de capacité du checkout hébergé
    Instant createdAt,
    Instant updatedAt
) {
    public boolean isFinal() { return "SUCCESS".equals(status) || "FAILED".equals(status) || "REFUNDED".equals(status); }
}
