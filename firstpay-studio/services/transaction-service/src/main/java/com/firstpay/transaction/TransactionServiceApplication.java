package com.firstpay.transaction;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * transaction-service — cœur CQRS/Event-Sourcing de Cash collect First.
 * Écriture asynchrone (202 Accepted) + outbox → Kafka, cible ~16 667 TPS.
 */
@SpringBootApplication
@EnableScheduling
public class TransactionServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(TransactionServiceApplication.class, args);
    }
}
