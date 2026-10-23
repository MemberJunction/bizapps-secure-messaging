#!/usr/bin/env bash
# =============================================================================
# Secure Messaging API Endpoint Test Script
# =============================================================================
# Prerequisites:
#   1. An MJAPI host running with this app installed (the in-repo dev harness was removed with the pnpm migration)
#   2. Database: Izzy_SecureMsg_Test
#   3. Docker container: mj-sqlserver
#
# Usage:
#   ./test/test-endpoints.sh           # seed + test all
#   ./test/test-endpoints.sh --seed    # only seed data
#   ./test/test-endpoints.sh --test    # only run curl tests (data already seeded)
# =============================================================================

set -euo pipefail

BASE_URL="http://localhost:4000/secure-messaging/api/v1"
TEST_TOKEN="sm_testtoken_for_local_testing_only"
THREAD_ID="test-thread-001"
DB_NAME="Izzy_SecureMsg_Test"
# SECURITY: never commit credentials — supply them via environment variables.
DB_USER="${SM_TEST_DB_USER:?Set SM_TEST_DB_USER}"
DB_PASS="${SM_TEST_DB_PASS:?Set SM_TEST_DB_PASS}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "  ${RED}✗ FAIL${NC}: $1"; }
info() { echo -e "  ${CYAN}ℹ${NC} $1"; }
header() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

# ---- Compute token hash ----
TOKEN_HASH=$(printf '%s' "$TEST_TOKEN" | shasum -a 256 | awk '{print $1}')

# ---- Determine mode ----
MODE="${1:-all}"

# ---- Seed Data ----
seed_data() {
    header "Seeding test data"
    info "Token: $TEST_TOKEN"
    info "Hash:  $TOKEN_HASH"

    # Read the SQL template and replace the hash placeholder
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    SQL=$(sed "s/{{TOKEN_HASH}}/$TOKEN_HASH/g" "$SCRIPT_DIR/seed-test-data.sql")

    # Run via sqlcmd in Docker
    echo "$SQL" | docker exec -i mj-sqlserver /opt/mssql-tools18/bin/sqlcmd \
        -S localhost -U "$DB_USER" -P "$DB_PASS" -d "$DB_NAME" -C

    if [ $? -eq 0 ]; then
        pass "Test data seeded"
    else
        fail "Seed data failed"
        exit 1
    fi
}

# ---- Test Endpoints ----
run_tests() {
    PASS_COUNT=0
    FAIL_COUNT=0

    # --- Test 1: POST /auth/validate (valid token) ---
    header "POST /auth/validate (valid token)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/validate" \
        -H "Content-Type: application/json" \
        -d "{\"token\": \"$TEST_TOKEN\"}")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    info "HTTP $HTTP_CODE"
    info "Body: $BODY"

    if [ "$HTTP_CODE" = "200" ]; then
        pass "Validate token returned 200"
        ((PASS_COUNT++))

        # Extract threadId from response for subsequent tests
        RESP_THREAD=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('threadId',''))" 2>/dev/null || echo "")
        if [ "$RESP_THREAD" = "$THREAD_ID" ]; then
            pass "Thread ID matches: $RESP_THREAD"
            ((PASS_COUNT++))
        else
            fail "Thread ID mismatch: expected '$THREAD_ID', got '$RESP_THREAD'"
            ((FAIL_COUNT++))
        fi
    else
        fail "Expected 200, got $HTTP_CODE"
        ((FAIL_COUNT++))
    fi

    # --- Test 2: POST /auth/validate (invalid token) ---
    header "POST /auth/validate (invalid token)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/validate" \
        -H "Content-Type: application/json" \
        -d '{"token": "sm_bogus_token_12345"}')

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    info "HTTP $HTTP_CODE"

    if [ "$HTTP_CODE" = "401" ]; then
        pass "Invalid token returned 401"
        ((PASS_COUNT++))
    else
        fail "Expected 401, got $HTTP_CODE"
        ((FAIL_COUNT++))
    fi

    # --- Test 3: POST /auth/validate (missing token) ---
    header "POST /auth/validate (missing token)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/validate" \
        -H "Content-Type: application/json" \
        -d '{}')

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)

    if [ "$HTTP_CODE" = "400" ]; then
        pass "Missing token returned 400"
        ((PASS_COUNT++))
    else
        fail "Expected 400, got $HTTP_CODE"
        ((FAIL_COUNT++))
    fi

    # --- Test 4: GET /threads/:threadId/messages (no auth) ---
    header "GET /threads/:threadId/messages (no auth)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/threads/$THREAD_ID/messages")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)

    if [ "$HTTP_CODE" = "401" ]; then
        pass "No auth returned 401"
        ((PASS_COUNT++))
    else
        fail "Expected 401, got $HTTP_CODE"
        ((FAIL_COUNT++))
    fi

    # --- Test 5: GET /threads/:threadId/messages (with auth) ---
    header "GET /threads/$THREAD_ID/messages (with auth)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/threads/$THREAD_ID/messages" \
        -H "Authorization: Bearer $TEST_TOKEN")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    info "HTTP $HTTP_CODE"
    info "Body: $BODY"

    if [ "$HTTP_CODE" = "200" ]; then
        pass "Get messages returned 200"
        ((PASS_COUNT++))
    else
        fail "Expected 200, got $HTTP_CODE"
        ((FAIL_COUNT++))
    fi

    # --- Test 6: GET /threads/wrong-thread/messages (wrong thread) ---
    header "GET /threads/wrong-thread/messages (wrong thread)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/threads/wrong-thread/messages" \
        -H "Authorization: Bearer $TEST_TOKEN")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)

    if [ "$HTTP_CODE" = "403" ]; then
        pass "Wrong thread returned 403"
        ((PASS_COUNT++))
    else
        fail "Expected 403, got $HTTP_CODE"
        ((FAIL_COUNT++))
    fi

    # --- Test 7: POST /threads/:threadId/messages (create message) ---
    header "POST /threads/$THREAD_ID/messages (create message)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/threads/$THREAD_ID/messages" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"content": "Hello from the secure messaging test script!", "subject": "Test Message"}')

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    info "HTTP $HTTP_CODE"
    info "Body: $BODY"

    if [ "$HTTP_CODE" = "201" ]; then
        pass "Create message returned 201"
        ((PASS_COUNT++))

        MSG_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('messageId',''))" 2>/dev/null || echo "")
        if [ -n "$MSG_ID" ]; then
            pass "Got message ID: $MSG_ID"
            ((PASS_COUNT++))
        else
            fail "No message ID in response"
            ((FAIL_COUNT++))
        fi
    else
        fail "Expected 201, got $HTTP_CODE"
        ((FAIL_COUNT++))
    fi

    # --- Test 8: POST /threads/:threadId/messages (empty content) ---
    header "POST /threads/$THREAD_ID/messages (empty content)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/threads/$THREAD_ID/messages" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"content": ""}')

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)

    if [ "$HTTP_CODE" = "400" ]; then
        pass "Empty content returned 400"
        ((PASS_COUNT++))
    else
        fail "Expected 400, got $HTTP_CODE"
        ((FAIL_COUNT++))
    fi

    # --- Test 9: GET messages again (should include the one we created) ---
    header "GET /threads/$THREAD_ID/messages (verify created message)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/threads/$THREAD_ID/messages" \
        -H "Authorization: Bearer $TEST_TOKEN")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    info "HTTP $HTTP_CODE"

    if [ "$HTTP_CODE" = "200" ]; then
        MSG_COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('messages',[])))" 2>/dev/null || echo "0")
        if [ "$MSG_COUNT" -ge "1" ]; then
            pass "Messages found: $MSG_COUNT"
            ((PASS_COUNT++))
        else
            fail "No messages found after creating one"
            ((FAIL_COUNT++))
        fi
    else
        fail "Expected 200, got $HTTP_CODE"
        ((FAIL_COUNT++))
    fi

    # --- Test 10: GET /threads/:threadId/attachments ---
    header "GET /threads/$THREAD_ID/attachments"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/threads/$THREAD_ID/attachments" \
        -H "Authorization: Bearer $TEST_TOKEN")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    info "HTTP $HTTP_CODE"

    if [ "$HTTP_CODE" = "200" ]; then
        pass "Get attachments returned 200"
        ((PASS_COUNT++))
    else
        fail "Expected 200, got $HTTP_CODE"
        ((FAIL_COUNT++))
    fi

    # --- Test 11: POST /auth/magic-link is REMOVED (unauthenticated token minting) ---
    # The public "request magic link" route was removed: it minted a raw magic-link token from a
    # caller-supplied (guessable) session ID pre-auth. It must now 404. Redemption
    # (/auth/magic-link/redeem) remains, but its tokens are only issued server-side, so it is not
    # exercised here.
    header "POST /auth/magic-link (must be removed)"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/magic-link" \
        -H "Content-Type: application/json" \
        -d "{\"sessionId\": \"00000000-0000-0000-0000-000000000000\"}")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    info "HTTP $HTTP_CODE"

    if [ "$HTTP_CODE" = "404" ]; then
        pass "Magic link request route is not exposed (404)"
        ((PASS_COUNT++))
    else
        fail "Expected 404 (route removed), got $HTTP_CODE"
        ((FAIL_COUNT++))
    fi

    # --- Summary ---
    echo ""
    header "Results"
    TOTAL=$((PASS_COUNT + FAIL_COUNT))
    echo -e "  ${GREEN}$PASS_COUNT passed${NC} / ${RED}$FAIL_COUNT failed${NC} / $TOTAL total"

    if [ "$FAIL_COUNT" -gt 0 ]; then
        echo ""
        echo -e "  ${YELLOW}NOTE:${NC} Re-run with --seed to reset the test data."
        exit 1
    fi
}

# ---- Main ----
echo -e "${CYAN}Secure Messaging API Test Suite${NC}"
echo "Base URL: $BASE_URL"
echo ""

case "$MODE" in
    --seed)
        seed_data
        ;;
    --test)
        run_tests
        ;;
    *)
        seed_data
        run_tests
        ;;
esac
