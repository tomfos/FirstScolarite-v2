package com.payhub.payment;

import com.payhub.payment.dto.CreatePaymentRequest;
import com.payhub.payment.dto.PaymentView;
import com.payhub.security.ApplicationContext;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * API paiement exposée aux applications clientes (authentifiées par clé API).
 * Serveur→serveur : l'application crée un paiement, puis consulte son statut (source de vérité).
 */
@RestController
@RequestMapping("/api/v1/payments")
public class PaymentController {

    private final PaymentService service;

    public PaymentController(PaymentService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<PaymentView> create(@Valid @RequestBody CreatePaymentRequest req,
                                    @RequestHeader(value = "X-Idempotency-Key", required = false) String idem,
                                    ServerWebExchange exchange) {
        return service.create(ApplicationContext.require(exchange), req, idem);
    }

    @GetMapping("/{id}")
    public Mono<ResponseEntity<PaymentView>> get(@PathVariable UUID id, ServerWebExchange exchange) {
        return service.get(id, ApplicationContext.require(exchange).id())
            .map(ResponseEntity::ok)
            .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @GetMapping
    public Flux<PaymentView> list(@RequestParam(defaultValue = "50") int limit, ServerWebExchange exchange) {
        return service.list(ApplicationContext.require(exchange).id(), Math.min(limit, 200));
    }

    /** Moyen indisponible pour l'application, montant invalide, etc. → 422. */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ProblemDetail> onInvalid(IllegalArgumentException e) {
        return ResponseEntity.unprocessableEntity()
            .body(ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage()));
    }
}
