package com.payhub.method.dto;

import com.payhub.method.PaymentMethod;

/** Moyen effectivement proposé à un payeur pour une application (vue client / checkout). */
public record MethodOption(
    String code,
    String label,
    String icon,
    String currency
) {
    public static MethodOption of(PaymentMethod m) {
        return new MethodOption(m.code(), m.label(), m.icon(), m.currency());
    }
}
