package com.payhub.application;

import java.time.Instant;
import java.util.UUID;

/**
 * Application cliente enregistrée sur le Hub. La clé API et le secret ne sont jamais
 * conservés en clair : seuls leurs hash SHA-256 sont stockés.
 */
public record Application(
    UUID id,
    String name,
    String slug,
    String apiKeyHash,
    String apiSecretHash,
    String status,          // active | suspended
    String brandColor,
    String logoUrl,
    String returnUrl,
    String webhookUrl,
    String webhookSecret,   // secret de signature HMAC (déchiffré ; null pour anciennes lignes)
    Instant createdAt,
    Instant updatedAt
) {
    public boolean isActive() { return "active".equals(status); }
}
