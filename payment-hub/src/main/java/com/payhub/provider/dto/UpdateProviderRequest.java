package com.payhub.provider.dto;

import java.util.Map;

/**
 * Configuration d'un provider (admin). Champs optionnels : seuls ceux fournis sont modifiés.
 * {@code credentials} remplace intégralement le jeu de credentials (chiffré au repos).
 */
public record UpdateProviderRequest(
    String mode,                        // sandbox | production
    Boolean enabled,
    Map<String, String> credentials     // ex. TrustPayWay : {baseUrl, appId, secret}
) {}
