package com.payhub.checkout.dto;

import jakarta.validation.constraints.NotBlank;

/** Choix du payeur sur la page de checkout. */
public record CheckoutPayRequest(
    @NotBlank String method,
    String payerMsisdn,
    String payerName
) {}
