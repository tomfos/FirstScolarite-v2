package com.payhub.method;

import com.payhub.method.ApplicationMethodStore.ApplicationMethod;
import com.payhub.method.dto.AppMethodView;
import com.payhub.method.dto.MethodOption;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Résout les moyens de paiement au niveau du catalogue et par application.
 * L'activation par application est le cœur du paramétrage : une application ne se voit
 * proposer que les moyens qu'on lui a explicitement activés.
 */
@Service
public class MethodService {

    private final PaymentMethodStore catalog;
    private final ApplicationMethodStore appMethods;

    public MethodService(PaymentMethodStore catalog, ApplicationMethodStore appMethods) {
        this.catalog = catalog;
        this.appMethods = appMethods;
    }

    /** Catalogue global des moyens. */
    public Flux<PaymentMethod> catalog() {
        return catalog.findAll();
    }

    /** Vue admin : tous les moyens actifs du catalogue avec leur état pour l'application. */
    public Flux<AppMethodView> forApplication(UUID applicationId) {
        return enabledMap(applicationId).flatMapMany(map ->
            catalog.findAll()
                .filter(PaymentMethod::active)
                .map(m -> AppMethodView.of(m, map.getOrDefault(m.code(), false))));
    }

    /** Moyens réellement proposés au payeur : catalogue actif ∩ activés pour l'application. */
    public Flux<MethodOption> offeredFor(UUID applicationId) {
        return enabledMap(applicationId).flatMapMany(map ->
            catalog.findAll()
                .filter(m -> m.active() && Boolean.TRUE.equals(map.get(m.code())))
                .map(MethodOption::of));
    }

    /** Active/désactive un moyen pour une application (le moyen doit exister au catalogue). */
    public Mono<Void> setForApplication(UUID applicationId, String methodCode, boolean enabled) {
        return catalog.findByCode(methodCode)
            .switchIfEmpty(Mono.error(new NoSuchElementException("Moyen inconnu : " + methodCode)))
            .flatMap(m -> appMethods.set(applicationId, methodCode, enabled))
            .then();
    }

    /** Vrai si le moyen est activé pour l'application (garde côté paiement, phase 4). */
    public Mono<Boolean> isOffered(UUID applicationId, String methodCode) {
        return offeredFor(applicationId).any(o -> o.code().equals(methodCode));
    }

    private Mono<Map<String, Boolean>> enabledMap(UUID applicationId) {
        return appMethods.findForApplication(applicationId)
            .collect(Collectors.toMap(ApplicationMethod::methodCode, ApplicationMethod::enabled));
    }
}
