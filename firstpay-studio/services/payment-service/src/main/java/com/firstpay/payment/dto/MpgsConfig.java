package com.firstpay.payment.dto;

/** Config MPGS (Hosted Checkout carte) lue depuis partner-service (/internal/mpgs-config). */
public record MpgsConfig(
    boolean enabled, String host, String merchantId, String password,
    String apiVersion, String appBaseUrl, String mode
) {
    public static MpgsConfig disabled() {
        return new MpgsConfig(false, "", "", "", "100", "", "production");
    }

    public boolean isReady() {
        return enabled
            && host != null && !host.isBlank()
            && merchantId != null && !merchantId.isBlank()
            && password != null && !password.isBlank();
    }

    /** Base REST : https://{host}/api/rest/version/{apiVersion}/merchant/{merchantId} */
    public String merchantApiBase() {
        String v = apiVersion == null || apiVersion.isBlank() ? "100" : apiVersion.trim();
        return "https://" + host + "/api/rest/version/" + v + "/merchant/" + merchantId;
    }

    /** URL du script Hosted Checkout, spécifique à la passerelle (test vs prod). */
    public String checkoutJsUrl() {
        return "https://" + host + "/static/checkout/checkout.min.js";
    }
}
