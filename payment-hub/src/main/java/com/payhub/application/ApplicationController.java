package com.payhub.application;

import com.payhub.application.dto.ApplicationCredentials;
import com.payhub.application.dto.ApplicationView;
import com.payhub.application.dto.CreateApplicationRequest;
import com.payhub.application.dto.UpdateApplicationRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * Administration des applications clientes. Protégé par le jeton admin
 * ({@code X-Admin-Token}, cf. {@code AdminAuthFilter}).
 */
@RestController
@RequestMapping("/admin/api/applications")
public class ApplicationController {

    private final ApplicationService service;

    public ApplicationController(ApplicationService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ApplicationCredentials> create(@Valid @RequestBody CreateApplicationRequest req) {
        return service.create(req);
    }

    @GetMapping
    public Flux<ApplicationView> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public Mono<ResponseEntity<ApplicationView>> get(@PathVariable UUID id) {
        return service.get(id).map(ResponseEntity::ok)
            .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public Mono<ResponseEntity<ApplicationView>> update(@PathVariable UUID id,
                                                        @RequestBody UpdateApplicationRequest req) {
        return service.update(id, req).map(ResponseEntity::ok)
            .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/rotate-keys")
    public Mono<ApplicationCredentials> rotateKeys(@PathVariable UUID id) {
        return service.rotateKeys(id);
    }

    @DeleteMapping("/{id}")
    public Mono<ResponseEntity<Void>> delete(@PathVariable UUID id) {
        return service.delete(id).map(ok -> ok
            ? ResponseEntity.noContent().<Void>build()
            : ResponseEntity.notFound().<Void>build());
    }
}
