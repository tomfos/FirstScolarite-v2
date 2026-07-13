package com.payhub.connector;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Aiguille un moyen de paiement vers le connecteur qui le gère (découverte auto des beans). */
@Component
public class PaymentConnectorRouter {

    private final Map<String, PaymentConnector> byMethod = new HashMap<>();

    public PaymentConnectorRouter(List<PaymentConnector> connectors) {
        for (PaymentConnector c : connectors) {
            for (String method : c.methods()) {
                byMethod.put(method, c);
            }
        }
    }

    public Optional<PaymentConnector> forMethod(String method) {
        return method == null ? Optional.empty() : Optional.ofNullable(byMethod.get(method));
    }
}
