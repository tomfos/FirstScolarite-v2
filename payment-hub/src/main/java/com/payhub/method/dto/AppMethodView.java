package com.payhub.method.dto;

import com.payhub.method.PaymentMethod;

/** Vue admin : un moyen du catalogue avec son état d'activation pour une application donnée. */
public record AppMethodView(
    String code,
    String label,
    String providerCode,
    String icon,
    boolean enabled
) {
    public static AppMethodView of(PaymentMethod m, boolean enabled) {
        return new AppMethodView(m.code(), m.label(), m.providerCode(), m.icon(), enabled);
    }
}
