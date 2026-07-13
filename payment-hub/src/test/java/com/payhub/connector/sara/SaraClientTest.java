package com.payhub.connector.sara;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SaraClientTest {

    @Test
    void mappe_les_statuts_wallet() {
        assertTrue(SaraClient.mapStatus("COMPLETED", "r").isSuccess());
        assertTrue(SaraClient.mapStatus("PENDING", "r").isPending());
        assertTrue(SaraClient.mapStatus("FAILED", "r").isFailed());
        assertEquals("r", SaraClient.mapStatus("PROCESSING", "r").providerRef());
    }
}
