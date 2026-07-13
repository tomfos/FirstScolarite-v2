package com.payhub.checkout;

import com.payhub.checkout.dto.CheckoutPayRequest;
import com.payhub.checkout.dto.CheckoutPayResponse;
import com.payhub.checkout.dto.CheckoutStatusView;
import com.payhub.checkout.dto.CheckoutView;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * API publique de la page de paiement hébergée (pas de clé API : la capacité vient du jeton
 * {@code cs}). Appelée par la page/iframe payeur, en same-origin avec le Hub.
 */
@RestController
@RequestMapping("/checkout/api")
public class CheckoutController {

    private final CheckoutService service;

    public CheckoutController(CheckoutService service) {
        this.service = service;
    }

    @GetMapping("/{id}")
    public Mono<CheckoutView> resolve(@PathVariable UUID id, @RequestParam("cs") String cs) {
        return service.resolve(id, cs);
    }

    @PostMapping("/{id}/pay")
    public Mono<CheckoutPayResponse> pay(@PathVariable UUID id, @RequestParam("cs") String cs,
                                         @Valid @RequestBody CheckoutPayRequest req) {
        return service.pay(id, cs, req.method(), req.payerMsisdn(), req.payerName());
    }

    @GetMapping("/{id}/status")
    public Mono<CheckoutStatusView> status(@PathVariable UUID id, @RequestParam("cs") String cs) {
        return service.status(id, cs);
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<ProblemDetail> onNotFound(NoSuchElementException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ProblemDetail> onInvalid(IllegalArgumentException e) {
        return ResponseEntity.unprocessableEntity()
            .body(ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage()));
    }
}
