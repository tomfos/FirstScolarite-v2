package com.payhub.admin;

import com.payhub.payment.PaymentService;
import com.payhub.payment.dto.PaymentView;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

import java.util.UUID;

/** Consultation des paiements d'une application depuis le back-office. Protégé par X-Admin-Token. */
@RestController
public class AdminPaymentController {

    private final PaymentService payments;

    public AdminPaymentController(PaymentService payments) {
        this.payments = payments;
    }

    @GetMapping("/admin/api/applications/{appId}/payments")
    public Flux<PaymentView> list(@PathVariable UUID appId, @RequestParam(defaultValue = "50") int limit) {
        return payments.list(appId, Math.min(limit, 200));
    }
}
