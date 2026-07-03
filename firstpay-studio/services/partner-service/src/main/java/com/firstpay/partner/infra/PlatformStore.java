package com.firstpay.partner.infra;

import com.firstpay.partner.api.dto.Dtos.AggregatorConfigDto;
import com.firstpay.partner.api.dto.Dtos.PlatformSettingsDto;
import io.r2dbc.spi.Readable;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;

/** Accès aux paramètres plateforme (singleton id=1) : SMTP, URL appli, agrégateur TrustPayWay. */
@Repository
public class PlatformStore {

    private static final String DEFAULT_AGG_URL = "https://mobilewallet.trustpayway.com";

    private final DatabaseClient db;
    /** Défaut de l'URL appli (option 3, env APP_PUBLIC_BASE_URL) au lieu d'un localhost codé en dur. */
    private final String defaultAppUrl;

    public PlatformStore(DatabaseClient db,
                         @Value("${app.public-base-url:http://localhost:14200}") String defaultAppUrl) {
        this.db = db;
        this.defaultAppUrl = defaultAppUrl;
    }

    /** Lecture complète (mots de passe inclus) — usage interne (email, payment-service). */
    public Mono<PlatformSettingsDto> getRaw() {
        return db.sql("SELECT * FROM platform_settings WHERE id = 1")
            .map(PlatformStore::map).one()
            .defaultIfEmpty(emptyRaw());
    }

    /** Lecture pour l'UI : secrets masqués (passwordSet / aggSecretSet). */
    public Mono<PlatformSettingsDto> getMasked() {
        return getRaw().map(s -> new PlatformSettingsDto(
            s.smtpHost(), s.smtpPort(), s.smtpUsername(), null,
            s.smtpFromEmail(), s.smtpFromName(), s.smtpUseTls(), s.smtpEnabled(),
            s.appBaseUrl(), s.smtpPassword() != null && !s.smtpPassword().isBlank(),
            s.aggEnabled(), s.aggBaseUrl(), s.aggAppId(), null,
            s.aggSecret() != null && !s.aggSecret().isBlank()));
    }

    /** Config agrégateur pour le payment-service (secret en clair). */
    public Mono<AggregatorConfigDto> getAggregatorConfig() {
        return getRaw().map(s -> new AggregatorConfigDto(
            s.aggEnabled(),
            nz(s.aggBaseUrl(), DEFAULT_AGG_URL),
            nz(s.aggAppId()),
            nz(s.aggSecret()),
            nz(s.appBaseUrl(), defaultAppUrl)));
    }

    /**
     * Sauvegarde. Si un secret entrant est vide, on conserve l'ancien (l'UI ne le
     * renvoie pas en clair). Renvoie la version masquée.
     */
    public Mono<PlatformSettingsDto> save(PlatformSettingsDto in) {
        return getRaw().flatMap(cur -> {
            String pwd = blank(in.smtpPassword()) ? cur.smtpPassword() : in.smtpPassword();
            String aggSecret = blank(in.aggSecret()) ? cur.aggSecret() : in.aggSecret();
            return db.sql("""
                    UPDATE platform_settings SET
                      smtp_host = :host, smtp_port = :port, smtp_username = :user, smtp_password = :pwd,
                      smtp_from_email = :from, smtp_from_name = :fromName, smtp_use_tls = :tls,
                      smtp_enabled = :enabled, app_base_url = :url,
                      agg_enabled = :aggEnabled, agg_base_url = :aggUrl, agg_app_id = :aggAppId,
                      agg_secret = :aggSecret, updated_at = now()
                    WHERE id = 1
                    """)
                .bind("host", nz(in.smtpHost())).bind("port", in.smtpPort())
                .bind("user", nz(in.smtpUsername())).bind("pwd", nz(pwd))
                .bind("from", nz(in.smtpFromEmail())).bind("fromName", nz(in.smtpFromName()))
                .bind("tls", in.smtpUseTls()).bind("enabled", in.smtpEnabled())
                .bind("url", nz(in.appBaseUrl(), defaultAppUrl))
                .bind("aggEnabled", in.aggEnabled())
                .bind("aggUrl", nz(in.aggBaseUrl(), DEFAULT_AGG_URL))
                .bind("aggAppId", nz(in.aggAppId()))
                .bind("aggSecret", nz(aggSecret))
                .fetch().rowsUpdated().then(getMasked());
        });
    }

    private PlatformSettingsDto emptyRaw() {
        return new PlatformSettingsDto(null, 587, null, null, null,
            "FirstPay — Afriland First Bank", true, false, defaultAppUrl, false,
            false, DEFAULT_AGG_URL, null, null, false);
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }
    private static String nz(String s) { return s == null ? "" : s; }
    private static String nz(String s, String dflt) { return blank(s) ? dflt : s; }

    private static PlatformSettingsDto map(Readable r) {
        return new PlatformSettingsDto(
            r.get("smtp_host", String.class),
            r.get("smtp_port", Integer.class),
            r.get("smtp_username", String.class),
            r.get("smtp_password", String.class),
            r.get("smtp_from_email", String.class),
            r.get("smtp_from_name", String.class),
            Boolean.TRUE.equals(r.get("smtp_use_tls", Boolean.class)),
            Boolean.TRUE.equals(r.get("smtp_enabled", Boolean.class)),
            r.get("app_base_url", String.class),
            false,
            Boolean.TRUE.equals(r.get("agg_enabled", Boolean.class)),
            r.get("agg_base_url", String.class),
            r.get("agg_app_id", String.class),
            r.get("agg_secret", String.class),
            false);
    }
}
