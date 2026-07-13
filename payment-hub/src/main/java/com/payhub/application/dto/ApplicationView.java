package com.payhub.application.dto;

import com.payhub.application.Application;

import java.time.Instant;
import java.util.UUID;

/** Vue publique d'une application (sans les hash de clé/secret). */
public record ApplicationView(
    UUID id, String name, String slug, String status,
    String brandColor, String logoUrl, String returnUrl, String webhookUrl,
    Instant createdAt, Instant updatedAt
) {
    public static ApplicationView of(Application a) {
        return new ApplicationView(a.id(), a.name(), a.slug(), a.status(),
            a.brandColor(), a.logoUrl(), a.returnUrl(), a.webhookUrl(), a.createdAt(), a.updatedAt());
    }
}
