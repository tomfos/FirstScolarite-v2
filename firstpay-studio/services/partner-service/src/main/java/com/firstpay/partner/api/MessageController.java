package com.firstpay.partner.api;

import com.firstpay.partner.api.dto.Dtos.*;
import com.firstpay.partner.infra.EmailService;
import com.firstpay.partner.infra.MessageStore;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * Messagerie banque -> partenaires : la banque envoie un message a un partenaire cible ou a
 * tous a la fois ; le partenaire les recoit comme des notifications (cloche du portail) ET,
 * si le SMTP est configure, comme un vrai email (best-effort, cf. EmailService).
 */
@RestController
public class MessageController {

    private final MessageStore messages;
    private final EmailService email;

    public MessageController(MessageStore messages, EmailService email) {
        this.messages = messages;
        this.email = email;
    }

    @PostMapping("/api/v1/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<MessageDto> send(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User", required = false) String senderEmail,
            @RequestBody SendMessageRequest req) {
        if (!"bank_admin".equals(role)) {
            return Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Seul l'administrateur banque peut envoyer un message aux partenaires"));
        }
        if (req == null || req.subject() == null || req.subject().isBlank()
                || req.body() == null || req.body().isBlank()) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sujet et message requis"));
        }
        String sender = senderEmail != null && !senderEmail.isBlank() ? senderEmail : "Administrateur banque";
        return messages.send(sender, req)
            .flatMap(dto -> {
                UUID tenantId = dto.tenantId() != null ? UUID.fromString(dto.tenantId()) : null;
                return messages.recipientEmails(tenantId)
                    .flatMap(to -> email.sendPartnerMessageEmail(to, null, dto.subject(), dto.body()))
                    .then(Mono.just(dto));
            });
    }

    /** Vue banque : tout l'historique envoye. */
    @GetMapping("/api/v1/messages/sent")
    public Flux<MessageDto> listSent(@RequestHeader(value = "X-User-Role", required = false) String role) {
        if (!"bank_admin".equals(role)) {
            return Flux.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Seul l'administrateur banque peut consulter l'historique des messages"));
        }
        return messages.listSent();
    }

    /** Messages destines au partenaire connecte (cibles ou diffuses a tous). */
    @GetMapping("/api/v1/messages")
    public Flux<MessageDto> listMine(@RequestHeader("X-Tenant-Id") UUID tenantId) {
        return messages.listForTenant(tenantId);
    }

    @PostMapping("/api/v1/messages/{id}/lu")
    public Mono<Void> markRead(@PathVariable UUID id, @RequestHeader("X-Tenant-Id") UUID tenantId) {
        return messages.markRead(id, tenantId).then();
    }
}
