package com.payhub.application;

import com.payhub.application.dto.ApplicationCredentials;
import com.payhub.application.dto.ApplicationView;
import com.payhub.application.dto.CreateApplicationRequest;
import com.payhub.application.dto.UpdateApplicationRequest;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Locale;
import java.util.UUID;

/** Cas d'usage du registre d'applications (création, rotation de clés, mises à jour). */
@Service
public class ApplicationService {

    private final ApplicationStore store;

    public ApplicationService(ApplicationStore store) {
        this.store = store;
    }

    /** Crée une application et retourne ses identifiants en clair (une seule fois). */
    public Mono<ApplicationCredentials> create(CreateApplicationRequest req) {
        String apiKey = KeyGenerator.apiKey();
        String secret = KeyGenerator.secret();
        String webhookSecret = KeyGenerator.webhookSecret();
        Application app = new Application(
            UUID.randomUUID(),
            req.name(),
            slugify(req.slug() != null ? req.slug() : req.name()),
            ApiKeyHasher.sha256Hex(apiKey),
            ApiKeyHasher.sha256Hex(secret),
            "active",
            req.brandColor() != null ? req.brandColor() : "#E53935",
            req.logoUrl(), req.returnUrl(), req.webhookUrl(),
            webhookSecret, null, null
        );
        return store.insert(app)
            .map(saved -> new ApplicationCredentials(ApplicationView.of(saved), apiKey, secret, webhookSecret));
    }

    public Flux<ApplicationView> list() {
        return store.findAll().map(ApplicationView::of);
    }

    public Mono<ApplicationView> get(UUID id) {
        return store.findById(id).map(ApplicationView::of);
    }

    public Mono<ApplicationView> update(UUID id, UpdateApplicationRequest req) {
        return store.update(id, req.name(), req.status(), req.brandColor(),
                req.logoUrl(), req.returnUrl(), req.webhookUrl())
            .map(ApplicationView::of);
    }

    /** Régénère la clé API et le secret ; renvoie les nouveaux en clair. */
    public Mono<ApplicationCredentials> rotateKeys(UUID id) {
        String apiKey = KeyGenerator.apiKey();
        String secret = KeyGenerator.secret();
        return store.updateKeys(id, ApiKeyHasher.sha256Hex(apiKey), ApiKeyHasher.sha256Hex(secret))
            .map(saved -> new ApplicationCredentials(ApplicationView.of(saved), apiKey, secret, saved.webhookSecret()));
    }

    public Mono<Boolean> delete(UUID id) {
        return store.delete(id).map(n -> n > 0);
    }

    static String slugify(String raw) {
        String s = raw.toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("(^-+)|(-+$)", "");
        return s.isBlank() ? "app-" + UUID.randomUUID().toString().substring(0, 8) : s;
    }
}
