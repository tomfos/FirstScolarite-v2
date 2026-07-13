package com.payhub.application.dto;

/**
 * Renvoyé UNE SEULE FOIS à la création (ou rotation) d'une application : la clé API et le
 * secret en clair. Ils ne sont plus jamais consultables ensuite (seuls les hash sont stockés).
 */
public record ApplicationCredentials(
    ApplicationView application,
    String apiKey,
    String apiSecret,
    String webhookSecret
) {}
