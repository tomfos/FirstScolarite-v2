package com.firstpay.partner.api.dto;

import java.util.List;
import java.util.Map;

/** DTOs REST du partner-service. */
public final class Dtos {
    private Dtos() {}

    public record InterfaceFieldDto(String id, String type, String label, boolean required,
                                    boolean readonly, List<String> options) {}

    /**
     * Frais proposé. `allowPartial` autorise un versement partiel (acompte) : le payeur peut régler
     * un montant compris entre `minAmount` (minimum à verser) et `amount` (montant complet).
     */
    public record PresetDto(long id, String label, String amount, boolean allowPartial, String minAmount) {}

    public record InterfaceDto(
        String id, String tenantId, String name, String description, String sector,
        String slug, String customSlug, String status, long tx, long collected,
        String amountType, String fixedAmount, String minAmount, String maxAmount, String currency,
        List<PresetDto> presets, boolean multiSelect, String refType, String refLabel, String refFormat,
        List<InterfaceFieldDto> customFields, Map<String, Boolean> methods, Map<String, Boolean> qrCodes
    ) {}

    public record SaveInterfaceRequest(
        String id, String name, String description, String sector, String customSlug, String status,
        String amountType, String fixedAmount, String minAmount, String maxAmount, String currency,
        List<PresetDto> presets, boolean multiSelect, String refType, String refLabel, String refFormat,
        List<InterfaceFieldDto> customFields, Map<String, Boolean> methods, Map<String, Boolean> qrCodes
    ) {}

    public record PartnerDto(String id, String code, String shortCode, String name, String sector, String status, int interfaceCount) {}

    /**
     * Création d'un partenaire par l'administrateur banque.
     * settlementAccount = numéro du compte qui recevra les fonds collectés ; accountHolder = titulaire.
     */
    public record CreatePartnerRequest(String name, String sector, String adminName, String adminEmail,
                                       String settlementAccount, String accountHolder, String settlementBank) {}

    /** Réponse de création : le partenaire + l'API-key + les identifiants temporaires (affichés une fois). */
    public record CreatePartnerResponse(PartnerDto partner, String apiKey, String adminEmail, String tempPassword) {}

    /** Configuration SMTP + agrégateur TrustPayWay (secrets masqués en lecture). */
    public record PlatformSettingsDto(
        String smtpHost, int smtpPort, String smtpUsername, String smtpPassword,
        String smtpFromEmail, String smtpFromName, boolean smtpUseTls, boolean smtpEnabled,
        String appBaseUrl, boolean passwordSet,
        boolean aggEnabled, String aggBaseUrl, String aggAppId, String aggSecret, boolean aggSecretSet) {}

    /** Config agrégateur (usage interne payment-service, secret inclus). */
    public record AggregatorConfigDto(
        boolean enabled, String baseUrl, String appId, String secret, String webhookBaseUrl) {}

    public record UserDto(String id, String name, String email, String role, String status) {}

    /** Marque du commerçant exposée à la page payeur publique (rien de sensible). */
    public record PublicMerchantDto(String name, String shortCode, String logoUrl, String brandColor) {}

    /**
     * Vue PUBLIQUE d'une interface de paiement, servie sans authentification à la page payeur
     * (`pay.firstpay.cm/{shortCode}/{slug}`). Ne contient QUE ce que le payeur doit voir :
     * pas de tenantId, pas de compteurs (tx/collected), pas de QR internes, pas de statut.
     * N'est renvoyée que pour une interface `status = actif` d'un tenant `ACTIVE`.
     */
    public record PublicCheckoutDto(
        String interfaceId, String name, String description, String sector, String slug,
        String amountType, String fixedAmount, String minAmount, String maxAmount, String currency,
        List<PresetDto> presets, boolean multiSelect, String refType, String refLabel, String refFormat,
        List<InterfaceFieldDto> customFields, Map<String, Boolean> methods, PublicMerchantDto merchant
    ) {}

    /**
     * Requête d'initiation de paiement envoyée par la page payeur publique.
     * `amount` est ignoré pour amountType=fixed ; `presetId` sert pour amountType=preset (sélection simple) ;
     * `presetIds` remplace `presetId` quand l'interface autorise la sélection multiple (panier de frais) ;
     * `presetAmounts` mappe l'ID d'un frais → montant partiel saisi (acompte), pris en compte uniquement
     * si le frais autorise l'acompte ; `fields` mappe l'ID de champ personnalisé → valeur saisie.
     */
    public record PublicPayRequest(
        String method, String amount, String phone, String payer, Long presetId,
        List<Long> presetIds, Map<String, String> presetAmounts, Map<String, String> fields
    ) {}

    /** Réponse d'initiation : la transaction est créée (PENDING) côté plateforme. */
    public record PublicPayResponse(String transactionId, String reference, String status) {}

    /** Statut public d'une transaction (polling par la page payeur). */
    public record PublicTxStatusDto(
        String transactionId, String reference, String status, String amount, String currency, String method
    ) {}

    public record SettingsDto(String tenantId, String logoUrl, String logoName, String brandColor, Map<String, Object> notifications) {}
}
