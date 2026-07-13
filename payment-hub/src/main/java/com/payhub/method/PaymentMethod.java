package com.payhub.method;

/** Moyen de paiement du catalogue, rattaché à un provider. */
public record PaymentMethod(
    String code,
    String label,
    String providerCode,
    String icon,
    String currency,
    int sortOrder,
    boolean active
) {}
