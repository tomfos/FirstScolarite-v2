package com.payhub.payment.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Demande de création d'un paiement par une application cliente.
 * {@code method}/{@code payerMsisdn} sont optionnels : s'ils sont fournis, le Hub débite
 * immédiatement ; sinon le paiement reste en attente que le payeur choisisse au checkout.
 */
public record CreatePaymentRequest(
    String reference,
    @NotNull @Positive BigDecimal amount,
    String currency,
    String method,
    String payerMsisdn,
    String payerName,
    String returnUrl,
    Map<String, Object> metadata
) {}
