package com.firstpay.partner.api;

import com.firstpay.partner.api.dto.Dtos.MpgsConfigDto;
import com.firstpay.partner.infra.PlatformStore;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * Config MPGS (Hosted Checkout carte) pour le payment-service (réseau interne Docker, protégé
 * par le filtre X-Internal-Token comme /internal/aggregator-config — non exposé via la gateway).
 */
@RestController
@RequestMapping("/internal/mpgs-config")
public class InternalMpgsController {

    private final PlatformStore platform;

    public InternalMpgsController(PlatformStore platform) { this.platform = platform; }

    @GetMapping
    public Mono<MpgsConfigDto> get() {
        return platform.getMpgsConfig();
    }
}
