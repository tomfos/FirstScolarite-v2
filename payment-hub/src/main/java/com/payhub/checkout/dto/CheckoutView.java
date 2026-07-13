package com.payhub.checkout.dto;

import com.payhub.method.dto.MethodOption;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Données affichées par la page de paiement hébergée (page/iframe payeur). */
public record CheckoutView(
    UUID paymentId,
    String reference,
    BigDecimal amount,
    String currency,
    String status,
    Branding application,
    List<MethodOption> methods,
    String returnUrl
) {
    /** Marque de l'application, appliquée à la page de paiement. */
    public record Branding(String name, String brandColor, String logoUrl) {}
}
