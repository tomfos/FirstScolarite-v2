package com.firstpay.payment.infra;

import com.firstpay.payment.dto.MpgsConfig;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.Instant;

/** Charge la config MPGS depuis partner-service (cache 60 s), comme AggregatorConfigProvider. */
@Component
public class MpgsConfigProvider {

    private final WebClient partner;
    private volatile MpgsConfig cached = MpgsConfig.disabled();
    private volatile Instant cachedAt = Instant.EPOCH;

    public MpgsConfigProvider(@Qualifier("partner") WebClient partnerWebClient) {
        this.partner = partnerWebClient;
    }

    public Mono<MpgsConfig> get() {
        if (cachedAt.plus(Duration.ofSeconds(60)).isAfter(Instant.now())) {
            return Mono.just(cached);
        }
        return partner.get()
            .uri("/internal/mpgs-config")
            .retrieve()
            .bodyToMono(MpgsConfig.class)
            .doOnNext(c -> { cached = c; cachedAt = Instant.now(); })
            .onErrorReturn(cached);
    }
}
