package com.payhub.provider.dto;

import com.payhub.provider.Provider;

import java.util.Set;
import java.util.TreeSet;

/**
 * Vue admin d'un provider — SANS les valeurs de credentials (seules les clés présentes
 * sont listées, pour indiquer ce qui est renseigné sans exposer les secrets).
 */
public record ProviderView(
    String code,
    String label,
    String mode,
    boolean enabled,
    boolean ready,
    Set<String> credentialKeys
) {
    public static ProviderView of(Provider p) {
        return new ProviderView(p.code(), p.label(), p.mode(), p.enabled(), p.isReady(),
            new TreeSet<>(p.credentials().keySet()));
    }
}
