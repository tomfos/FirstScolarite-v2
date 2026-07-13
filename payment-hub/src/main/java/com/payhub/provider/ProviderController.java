package com.payhub.provider;

import com.payhub.provider.dto.ProviderView;
import com.payhub.provider.dto.UpdateProviderRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Administration des providers (PSP). Protégé par {@code X-Admin-Token}. */
@RestController
@RequestMapping("/admin/api/providers")
public class ProviderController {

    private final ProviderService service;

    public ProviderController(ProviderService service) {
        this.service = service;
    }

    @GetMapping
    public Flux<ProviderView> list() {
        return service.list();
    }

    @GetMapping("/{code}")
    public Mono<ResponseEntity<ProviderView>> get(@PathVariable String code) {
        return service.get(code).map(ResponseEntity::ok)
            .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @PutMapping("/{code}")
    public Mono<ResponseEntity<ProviderView>> update(@PathVariable String code,
                                                     @RequestBody UpdateProviderRequest req) {
        return service.update(code, req).map(ResponseEntity::ok)
            .defaultIfEmpty(ResponseEntity.notFound().build());
    }
}
