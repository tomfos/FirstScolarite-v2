package com.firstpay.payment.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.firstpay.payment.dto.PaymentResult;
import com.firstpay.payment.dto.TransactionCreatedEvent;
import com.firstpay.payment.orchestration.PaymentOrchestrator;
import com.firstpay.payment.orchestration.PaymentReconciliationService;
import jakarta.annotation.PostConstruct;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.kafka.receiver.KafkaReceiver;
import reactor.kafka.receiver.ReceiverOptions;
import reactor.kafka.receiver.ReceiverRecord;
import reactor.kafka.sender.KafkaSender;
import reactor.kafka.sender.SenderRecord;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Pipeline de traitement : consomme transactions.created, orchestre l'encaissement,
 * publie le résultat immédiat (simulation / échec). Les paiements PENDING agrégateur
 * sont finalisés par webhook ou réconciliation planifiée.
 */
@Service
public class PaymentEventConsumer {

    private static final String TOPIC_OK = "transactions.processed";
    private static final String TOPIC_KO = "transactions.failed";

    private final ReceiverOptions<String, String> options;
    private final KafkaSender<String, String> sender;
    private final PaymentOrchestrator orchestrator;
    private final ObjectMapper json;

    public PaymentEventConsumer(ReceiverOptions<String, String> createdReceiverOptions,
                                KafkaSender<String, String> sender,
                                PaymentOrchestrator orchestrator, ObjectMapper json) {
        this.options = createdReceiverOptions;
        this.sender = sender;
        this.orchestrator = orchestrator;
        this.json = json;
    }

    @PostConstruct
    public void start() {
        KafkaReceiver.create(options)
            .receive()
            .groupBy(ReceiverRecord::partition)
            .flatMap(partition -> partition.concatMap(this::handle))
            .subscribe();
    }

    private Mono<Void> handle(ReceiverRecord<String, String> rec) {
        return Mono.fromCallable(() -> parse(rec.value()))
            .flatMap(orchestrator::process)
            .flatMap(result -> result.isPending() || result.isAwaitingCheckout() ? Mono.empty() : publish(result))
            .onErrorResume(e -> Mono.empty())
            .doFinally(s -> rec.receiverOffset().acknowledge());
    }

    private TransactionCreatedEvent parse(String value) {
        JsonNode n = readTree(value);
        String method = n.hasNonNull("method") ? n.get("method").asText() : null;
        return new TransactionCreatedEvent(
            UUID.fromString(n.get("id").asText()),
            n.hasNonNull("tenantId") ? UUID.fromString(n.get("tenantId").asText()) : null,
            n.hasNonNull("amount") ? n.get("amount").decimalValue() : BigDecimal.ZERO,
            n.hasNonNull("currency") ? n.get("currency").asText() : "XAF",
            method,
            n.hasNonNull("phone") ? n.get("phone").asText() : "",
            n.hasNonNull("orderId") ? n.get("orderId").asText() : n.get("id").asText());
    }

    private Mono<Void> publish(PaymentResult result) {
        String topic = result.isSuccess() ? TOPIC_OK : TOPIC_KO;
        String payload = write(result);
        SenderRecord<String, String, UUID> out = SenderRecord.create(
            new ProducerRecord<>(topic, result.id().toString(), payload), result.id());
        return sender.send(Mono.just(out)).then();
    }

    private JsonNode readTree(String v) {
        try { return json.readTree(v); } catch (Exception e) { throw new IllegalArgumentException("payload illisible", e); }
    }

    private String write(PaymentResult r) {
        try { return json.writeValueAsString(r); } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
