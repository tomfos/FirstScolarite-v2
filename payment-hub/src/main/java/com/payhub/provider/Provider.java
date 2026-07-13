package com.payhub.provider;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Un PSP configuré au centre du Hub (TrustPayWay, MPGS, SARA, RTGS…).
 * Les {@code credentials} sont manipulés en clair dans l'application mais chiffrés au repos
 * (cf. {@link ProviderStore}). Le {@code mode} bascule sandbox/production sans changer de code.
 */
public record Provider(
    UUID id,
    String code,
    String label,
    String mode,                    // sandbox | production
    boolean enabled,
    Map<String, String> credentials,
    Instant createdAt,
    Instant updatedAt
) {
    /** Prêt à encaisser réellement : activé et au moins un credential renseigné. */
    public boolean isReady() {
        return enabled && credentials != null && !credentials.isEmpty();
    }
}
