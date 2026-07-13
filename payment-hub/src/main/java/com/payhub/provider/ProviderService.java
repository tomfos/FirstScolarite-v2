package com.payhub.provider;

import com.payhub.provider.dto.ProviderView;
import com.payhub.provider.dto.UpdateProviderRequest;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Configuration centrale des providers (PSP). */
@Service
public class ProviderService {

    private final ProviderStore store;

    public ProviderService(ProviderStore store) {
        this.store = store;
    }

    public Flux<ProviderView> list() {
        return store.findAll().map(ProviderView::of);
    }

    public Mono<ProviderView> get(String code) {
        return store.findByCode(code).map(ProviderView::of);
    }

    public Mono<ProviderView> update(String code, UpdateProviderRequest req) {
        return store.update(code, req.mode(), req.enabled(), req.credentials())
            .map(ProviderView::of);
    }

    /** Accès interne (connecteurs, phase 3) : provider avec credentials déchiffrés. */
    public Mono<Provider> resolve(String code) {
        return store.findByCode(code);
    }
}
