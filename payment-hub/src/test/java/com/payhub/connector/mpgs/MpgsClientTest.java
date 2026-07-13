package com.payhub.connector.mpgs;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class MpgsClientTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void interprete_retrieve_order() throws Exception {
        assertTrue(MpgsClient.interpret(json.readTree("{\"result\":\"SUCCESS\",\"status\":\"CAPTURED\"}"), "o").isSuccess());
        assertTrue(MpgsClient.interpret(json.readTree("{\"result\":\"FAILURE\",\"status\":\"FAILED\"}"), "o").isFailed());
        assertTrue(MpgsClient.interpret(json.readTree("{\"result\":\"PENDING\"}"), "o").isPending());
    }
}
