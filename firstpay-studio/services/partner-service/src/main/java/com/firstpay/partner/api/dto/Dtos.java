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
        String id, String tenantId, String name, String description, String sector, String country,
        String slug, String customSlug, String status, long tx, long collected,
        String amountType, String fixedAmount, String minAmount, String maxAmount, String currency,
        List<PresetDto> presets, boolean multiSelect, String refType, String refLabel, String refFormat,
        List<InterfaceFieldDto> customFields, Map<String, Boolean> methods, Map<String, Boolean> qrCodes,
        String establishment
    ) {}

    public record SaveInterfaceRequest(
        String id, String name, String description, String sector, String country, String customSlug, String status,
        String amountType, String fixedAmount, String minAmount, String maxAmount, String currency,
        List<PresetDto> presets, boolean multiSelect, String refType, String refLabel, String refFormat,
        List<InterfaceFieldDto> customFields, Map<String, Boolean> methods, Map<String, Boolean> qrCodes,
        String establishment
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

    /**
     * Configuration SMTP + agrégateur TrustPayWay (secrets masqués en lecture).
     * <p>Les champs {@code agg*} (hors sandbox) constituent le jeu d'identifiants PRODUCTION ;
     * les champs {@code aggSandbox*} le jeu SANDBOX. {@code aggMode} (« sandbox » | « production »)
     * choisit lequel est actif ; {@code aggEnabled} reste l'interrupteur global des paiements réels.
     */
    public record PlatformSettingsDto(
        String smtpHost, int smtpPort, String smtpUsername, String smtpPassword,
        String smtpFromEmail, String smtpFromName, boolean smtpUseTls, boolean smtpEnabled,
        String appBaseUrl, boolean passwordSet,
        boolean aggEnabled, String aggBaseUrl, String aggAppId, String aggSecret, boolean aggSecretSet,
        String aggMode,
        String aggSandboxBaseUrl, String aggSandboxAppId, String aggSandboxSecret, boolean aggSandboxSecretSet,
        // Passerelle carte MPGS (Mastercard). Deux jeux d'identifiants + mode, mot de passe masqué en lecture.
        boolean mpgsEnabled, String mpgsMode, String mpgsApiVersion,
        String mpgsHost, String mpgsMerchantId, String mpgsPassword, boolean mpgsPasswordSet,
        String mpgsSandboxHost, String mpgsSandboxMerchantId, String mpgsSandboxPassword, boolean mpgsSandboxPasswordSet) {}

    /**
     * Config agrégateur résolue selon le mode actif (usage interne payment-service, secret inclus).
     * {@code mode} est propagé pour scoper le cache de jeton entre sandbox et production.
     */
    public record AggregatorConfigDto(
        boolean enabled, String baseUrl, String appId, String secret, String webhookBaseUrl, String mode) {}

    /**
     * Config MPGS résolue selon le mode actif (usage interne payment-service, mot de passe inclus).
     * {@code appBaseUrl} sert à construire la returnUrl absolue du Hosted Checkout.
     */
    public record MpgsConfigDto(
        boolean enabled, String host, String merchantId, String password,
        String apiVersion, String appBaseUrl, String mode) {}

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
        String interfaceId, String name, String description, String sector, String country, String slug,
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

    /* ------------------------ Répertoire étudiants (matricule) ------------------------ */

    /**
     * Résultat d'une recherche PUBLIQUE par matricule sur la page payeur.
     * `found` = le matricule existe dans le répertoire de l'établissement ; `fields` mappe
     * l'ID d'un champ personnalisé -> valeur importée (nom, prénom, classe…), prêt à être
     * injecté dans le formulaire pour vérification par l'étudiant.
     */
    public record StudentLookupDto(boolean found, Map<String, String> fields) {}

    /**
     * Requête d'import du répertoire (admin/partenaire). `rows` est la liste des lignes du
     * fichier importé : chaque ligne mappe l'en-tête de colonne -> valeur. Une ligne DOIT
     * comporter un « matricule ». `replace` remplace intégralement le répertoire existant.
     */
    public record RosterImportRequest(List<Map<String, String>> rows, boolean replace) {}

    /** Bilan d'un import : lignes insérées/mises à jour, lignes ignorées (sans matricule), total après import. */
    public record RosterImportResult(int imported, int skipped, long total) {}

    /** Aperçu du répertoire d'un partenaire (compteur + établissements distincts). */
    public record RosterSummaryDto(long total, List<String> establishments) {}
}
