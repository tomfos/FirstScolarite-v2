package com.payhub.connector;

/**
 * Résultat d'une tentative de débit auprès d'un PSP.
 * <ul>
 *   <li>{@code SUCCESS} : débit confirmé (paiement carte synchrone, ou statut final connu).</li>
 *   <li>{@code PENDING} : initié côté PSP, confirmation attendue par webhook/réconciliation
 *       (typique mobile money : le payeur valide sur son téléphone).</li>
 *   <li>{@code FAILED}  : refus / erreur.</li>
 * </ul>
 */
public record ChargeResult(String status, String providerRef, String reason) {

    public static ChargeResult success(String providerRef) { return new ChargeResult("SUCCESS", providerRef, null); }
    public static ChargeResult pending(String providerRef) { return new ChargeResult("PENDING", providerRef, null); }
    public static ChargeResult failed(String reason)       { return new ChargeResult("FAILED", null, reason); }

    public boolean isSuccess() { return "SUCCESS".equals(status); }
    public boolean isPending() { return "PENDING".equals(status); }
    public boolean isFailed()  { return "FAILED".equals(status); }
}
