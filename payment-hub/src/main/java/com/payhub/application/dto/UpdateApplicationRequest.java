package com.payhub.application.dto;

/** Mise à jour des champs modifiables d'une application (tous optionnels). */
public record UpdateApplicationRequest(
    String name,
    String status,      // active | suspended
    String brandColor,
    String logoUrl,
    String returnUrl,
    String webhookUrl
) {}
