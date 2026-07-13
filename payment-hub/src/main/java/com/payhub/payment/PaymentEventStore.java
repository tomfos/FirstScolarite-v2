package com.payhub.payment;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;

import java.util.UUID;

/** Journal append-only des évènements de paiement (audit / historique de statut). */
@Repository
public class PaymentEventStore {

    private final DatabaseClient db;

    public PaymentEventStore(DatabaseClient db) {
        this.db = db;
    }

    public Mono<Void> append(UUID paymentId, String type, String detailJson) {
        return db.sql("""
                INSERT INTO payment_events (payment_id, type, detail)
                VALUES (:pid, :type, CAST(:detail AS JSONB))
                """)
            .bind("pid", paymentId)
            .bind("type", type)
            .bind("detail", detailJson != null ? detailJson : "{}")
            .fetch().rowsUpdated().then();
    }
}
