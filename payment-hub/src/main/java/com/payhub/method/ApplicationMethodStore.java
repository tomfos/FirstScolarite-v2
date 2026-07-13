package com.payhub.method;

import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.UUID;

/** Activation des moyens PAR application (table {@code application_methods}). */
@Repository
public class ApplicationMethodStore {

    private final DatabaseClient db;

    public ApplicationMethodStore(DatabaseClient db) {
        this.db = db;
    }

    /** Couples (moyen, activé) explicitement définis pour une application. */
    public Flux<ApplicationMethod> findForApplication(UUID applicationId) {
        return db.sql("""
                SELECT method_code, enabled FROM application_methods
                WHERE application_id = :appId
                """)
            .bind("appId", applicationId)
            .map(ApplicationMethodStore::map).all();
    }

    /** Active ou désactive un moyen pour une application (upsert). */
    public Mono<Long> set(UUID applicationId, String methodCode, boolean enabled) {
        return db.sql("""
                INSERT INTO application_methods (application_id, method_code, enabled)
                VALUES (:appId, :code, :enabled)
                ON CONFLICT (application_id, method_code)
                DO UPDATE SET enabled = EXCLUDED.enabled
                """)
            .bind("appId", applicationId)
            .bind("code", methodCode)
            .bind("enabled", enabled)
            .fetch().rowsUpdated();
    }

    private static ApplicationMethod map(Readable row) {
        return new ApplicationMethod(
            row.get("method_code", String.class),
            Boolean.TRUE.equals(row.get("enabled", Boolean.class))
        );
    }

    /** Ligne d'activation par application. */
    public record ApplicationMethod(String methodCode, boolean enabled) {}
}
