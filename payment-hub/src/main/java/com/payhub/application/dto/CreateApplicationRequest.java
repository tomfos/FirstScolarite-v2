package com.payhub.application.dto;

import jakarta.validation.constraints.NotBlank;

/** Demande de création d'une application cliente (admin). */
public record CreateApplicationRequest(
    @NotBlank String name,
    String slug,
    String brandColor,
    String logoUrl,
    String returnUrl,
    String webhookUrl
) {}
