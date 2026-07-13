package com.payhub.method;

import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Catalogue des moyens de paiement (table {@code payment_methods}). */
@Repository
public class PaymentMethodStore {

    private static final String COLUMNS = "code, label, provider_code, icon, currency, sort_order, active";

    private final DatabaseClient db;

    public PaymentMethodStore(DatabaseClient db) {
        this.db = db;
    }

    public Flux<PaymentMethod> findAll() {
        return db.sql("SELECT " + COLUMNS + " FROM payment_methods ORDER BY sort_order")
            .map(PaymentMethodStore::map).all();
    }

    public Mono<PaymentMethod> findByCode(String code) {
        return db.sql("SELECT " + COLUMNS + " FROM payment_methods WHERE code = :code")
            .bind("code", code).map(PaymentMethodStore::map).one();
    }

    private static PaymentMethod map(Readable row) {
        return new PaymentMethod(
            row.get("code", String.class),
            row.get("label", String.class),
            row.get("provider_code", String.class),
            row.get("icon", String.class),
            row.get("currency", String.class),
            row.get("sort_order", Integer.class),
            Boolean.TRUE.equals(row.get("active", Boolean.class))
        );
    }
}
