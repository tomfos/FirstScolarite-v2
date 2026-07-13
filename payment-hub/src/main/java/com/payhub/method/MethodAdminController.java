package com.payhub.method;

import com.payhub.method.dto.AppMethodView;
import com.payhub.method.dto.SetMethodRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Administration des moyens : catalogue global et activation/désactivation par application.
 * Protégé par {@code X-Admin-Token}.
 */
@RestController
@RequestMapping("/admin/api")
public class MethodAdminController {

    private final MethodService service;

    public MethodAdminController(MethodService service) {
        this.service = service;
    }

    /** Catalogue global des moyens (tous providers confondus). */
    @GetMapping("/methods")
    public Flux<PaymentMethod> catalog() {
        return service.catalog();
    }

    /** État des moyens pour une application (activés/désactivés). */
    @GetMapping("/applications/{appId}/methods")
    public Flux<AppMethodView> forApplication(@PathVariable UUID appId) {
        return service.forApplication(appId);
    }

    /** Active ou désactive un moyen pour une application. */
    @PutMapping("/applications/{appId}/methods/{code}")
    public Mono<ResponseEntity<Void>> set(@PathVariable UUID appId,
                                          @PathVariable String code,
                                          @RequestBody SetMethodRequest req) {
        return service.setForApplication(appId, code, req.enabled())
            .thenReturn(ResponseEntity.noContent().<Void>build())
            .onErrorResume(NoSuchElementException.class,
                e -> Mono.just(ResponseEntity.notFound().build()));
    }
}
