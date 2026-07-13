package com.payhub.method;

import com.payhub.method.dto.MethodOption;
import com.payhub.security.ApplicationContext;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;

/**
 * Exposé aux applications clientes (authentifiées par clé API) : la liste des moyens de
 * paiement qui LEUR sont proposés. L'application n'a rien à configurer côté client — elle
 * lit simplement ce que le Hub a activé pour elle.
 */
@RestController
@RequestMapping("/api/v1/methods")
public class MethodClientController {

    private final MethodService service;

    public MethodClientController(MethodService service) {
        this.service = service;
    }

    @GetMapping
    public Flux<MethodOption> myMethods(ServerWebExchange exchange) {
        return service.offeredFor(ApplicationContext.require(exchange).id());
    }
}
