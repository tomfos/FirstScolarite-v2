package com.payhub.connector.trustpayway;

import com.payhub.connector.ChargeResult;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TrustPayWayClientTest {

    @Test
    void normalise_msisdn_camerounais() {
        assertEquals("237699112233", TrustPayWayClient.normalizeMsisdn("699112233"));
        assertEquals("237699112233", TrustPayWayClient.normalizeMsisdn("+237 699 11 22 33"));
        assertEquals("237699112233", TrustPayWayClient.normalizeMsisdn("237699112233"));
        assertEquals("", TrustPayWayClient.normalizeMsisdn(null));
    }

    @Test
    void mappe_les_statuts_agregateur() {
        assertTrue(TrustPayWayClient.normalize("SUCCESSFUL", "ref").isSuccess());
        assertTrue(TrustPayWayClient.normalize("FAILED", "ref").isFailed());
        assertTrue(TrustPayWayClient.normalize("INITIATED", "ref").isPending());
        ChargeResult pending = TrustPayWayClient.normalize("PENDING", "ref");
        assertEquals("ref", pending.providerRef());
    }
}
