package com.payhub.connector;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Données nécessaires à un connecteur pour débiter un payeur. Construit par l'orchestrateur
 * à partir d'un paiement + du moyen choisi ; indépendant du PSP cible.
 */
public record PaymentAttempt(
    UUID paymentId,
    String method,          // orange | mtn | card | sara | transfer
    BigDecimal amount,
    String currency,
    String payerMsisdn,
    String payerName,
    String reference,
    String notifyUrl        // webhook du Hub où le PSP confirmera (asynchrone)
) {}
