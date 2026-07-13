package com.payhub.connector;

import reactor.core.publisher.Mono;

import java.time.Duration;

/**
 * Débit simulé (démo/dev) : latence réaliste + ~5 % d'échecs déterministes. Utilisé lorsque
 * le provider d'un moyen n'est pas encore configuré et que la simulation est activée
 * ({@code payhub.payment.simulation-enabled}).
 */
public final class SimulatedCharge {

    private SimulatedCharge() {}

    public static Mono<ChargeResult> of(PaymentAttempt a) {
        long latency = 20 + Math.floorMod(a.paymentId().getLeastSignificantBits(), 60);
        boolean fail = Math.floorMod(a.paymentId().hashCode(), 20) == 0;
        String ref = "SIM-" + a.paymentId().toString().substring(0, 8);
        return Mono.delay(Duration.ofMillis(latency))
            .map(t -> fail ? ChargeResult.failed("Refus simulé (" + a.method() + ")")
                           : ChargeResult.success(ref));
    }
}
