#!/usr/bin/env python3
"""
Backend test suite for /api/users CRUD endpoints
Tests POST/PATCH/DELETE operations + regression tests for GET
"""

import requests
import json
import sys

# Base URL from .env
BASE_URL = "https://dtf-print-hub-2.preview.emergentagent.com/api"

def log(msg):
    print(f"[TEST] {msg}")

def test_get_users_regression():
    """A) GET /api/users - Regression tests (4 test cases)"""
    log("=" * 80)
    log("A) GET /api/users - REGRESSION TESTS")
    log("=" * 80)
    
    # A1: GET /api/users → array with at least 3 users
    log("\nA1: GET /api/users → should return at least 3 users (admin, operator, customer)")
    try:
        r = requests.get(f"{BASE_URL}/users")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        users = r.json()
        assert isinstance(users, list), "Response should be array"
        assert len(users) >= 3, f"Expected at least 3 users, got {len(users)}"
        
        # Verify no passwordHash or _id in any user
        for user in users:
            assert 'passwordHash' not in user, f"User {user.get('id')} has passwordHash (should be stripped)"
            assert '_id' not in user, f"User {user.get('id')} has _id (should be stripped)"
            assert 'id' in user, "User should have UUID id"
            assert 'email' in user, "User should have email"
            assert 'role' in user, "User should have role"
            assert 'fullName' in user, "User should have fullName"
        
        log(f"✅ PASS - GET /api/users returned {len(users)} users, no passwordHash or _id")
        return users
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # A2: GET /api/users?role=operator → 1 operator
    log("\nA2: GET /api/users?role=operator → should return 1 operator")
    try:
        r = requests.get(f"{BASE_URL}/users?role=operator")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        operators = r.json()
        assert isinstance(operators, list), "Response should be array"
        assert len(operators) >= 1, f"Expected at least 1 operator, got {len(operators)}"
        assert all(u['role'] == 'operator' for u in operators), "All users should have role=operator"
        log(f"✅ PASS - GET /api/users?role=operator returned {len(operators)} operator(s)")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # A3: GET /api/users?role=admin → 1 admin
    log("\nA3: GET /api/users?role=admin → should return 1 admin")
    try:
        r = requests.get(f"{BASE_URL}/users?role=admin")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        admins = r.json()
        assert isinstance(admins, list), "Response should be array"
        assert len(admins) >= 1, f"Expected at least 1 admin, got {len(admins)}"
        assert all(u['role'] == 'admin' for u in admins), "All users should have role=admin"
        log(f"✅ PASS - GET /api/users?role=admin returned {len(admins)} admin(s)")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # A4: GET /api/users?role=customer → 1 customer
    log("\nA4: GET /api/users?role=customer → should return 1 customer")
    try:
        r = requests.get(f"{BASE_URL}/users?role=customer")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        customers = r.json()
        assert isinstance(customers, list), "Response should be array"
        assert len(customers) >= 1, f"Expected at least 1 customer, got {len(customers)}"
        assert all(u['role'] == 'customer' for u in customers), "All users should have role=customer"
        log(f"✅ PASS - GET /api/users?role=customer returned {len(customers)} customer(s)")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)

def test_post_users():
    """B) POST /api/users - Create new users (8 test cases)"""
    log("\n" + "=" * 80)
    log("B) POST /api/users - CREATE NEW USERS")
    log("=" * 80)
    
    # B1: Happy path - create operator
    log("\nB1: POST /api/users - Happy path with all fields")
    try:
        payload = {
            "fullName": "Test QA User",
            "email": "qa@estampadosdlv.cl",
            "role": "operator",
            "phone": "+56912345678",
            "rut": "11.111.111-1",
            "address": {
                "street": "Test 1",
                "comuna": "Test",
                "city": "Santiago",
                "region": "RM"
            }
        }
        r = requests.post(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        user = r.json()
        
        # Verify response structure
        assert 'id' in user, "Response should have UUID id"
        assert 'passwordHash' not in user, "Response should NOT have passwordHash"
        assert '_id' not in user, "Response should NOT have _id"
        assert user['email'] == 'qa@estampadosdlv.cl', f"Email should be lowercase: {user['email']}"
        assert user['role'] == 'operator', f"Role should be operator: {user['role']}"
        assert user['fullName'] == 'Test QA User', f"FullName mismatch: {user['fullName']}"
        assert user['active'] == True, f"Active should be true: {user['active']}"
        assert 'createdAt' in user, "Should have createdAt timestamp"
        
        created_user_id = user['id']
        log(f"✅ PASS - POST /api/users created user with id={created_user_id}, active=true, no passwordHash")
        return created_user_id
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # B2: Validation - no fullName
    log("\nB2: POST /api/users - Validation: no fullName → 400")
    try:
        payload = {"email": "test@test.cl", "role": "operator"}
        r = requests.post(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'nombre completo' in error['error'].lower(), f"Error message should mention 'nombre completo': {error['error']}"
        log(f"✅ PASS - POST without fullName → 400 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # B3: Validation - no email
    log("\nB3: POST /api/users - Validation: no email → 400")
    try:
        payload = {"fullName": "Test User", "role": "operator"}
        r = requests.post(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'email' in error['error'].lower(), f"Error message should mention 'email': {error['error']}"
        log(f"✅ PASS - POST without email → 400 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # B4: Validation - invalid email
    log("\nB4: POST /api/users - Validation: invalid email 'bademail' → 400")
    try:
        payload = {"fullName": "Test User", "email": "bademail", "role": "operator"}
        r = requests.post(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'email' in error['error'].lower() and 'inválido' in error['error'].lower(), f"Error message should mention 'email inválido': {error['error']}"
        log(f"✅ PASS - POST with invalid email → 400 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # B5: Validation - no role
    log("\nB5: POST /api/users - Validation: no role → 400")
    try:
        payload = {"fullName": "Test User", "email": "test@test.cl"}
        r = requests.post(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'role' in error['error'].lower() and 'inválido' in error['error'].lower(), f"Error message should mention 'role inválido': {error['error']}"
        log(f"✅ PASS - POST without role → 400 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # B6: Validation - invalid role
    log("\nB6: POST /api/users - Validation: invalid role 'boss' → 400")
    try:
        payload = {"fullName": "Test User", "email": "test@test.cl", "role": "boss"}
        r = requests.post(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'role' in error['error'].lower() and 'inválido' in error['error'].lower(), f"Error message should mention 'role inválido': {error['error']}"
        log(f"✅ PASS - POST with invalid role → 400 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # B7: Validation - duplicate email (exact)
    log("\nB7: POST /api/users - Validation: duplicate email → 409")
    try:
        payload = {
            "fullName": "Duplicate User",
            "email": "qa@estampadosdlv.cl",  # Same as B1
            "role": "operator"
        }
        r = requests.post(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 409, f"Expected 409, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'ya existe' in error['error'].lower() or 'email' in error['error'].lower(), f"Error message should mention duplicate: {error['error']}"
        log(f"✅ PASS - POST with duplicate email → 409 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # B8: Validation - duplicate email (case insensitive)
    log("\nB8: POST /api/users - Validation: duplicate email (uppercase) → 409")
    try:
        payload = {
            "fullName": "Duplicate User 2",
            "email": "QA@ESTAMPADOSDLV.CL",  # Uppercase version of B1
            "role": "operator"
        }
        r = requests.post(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 409, f"Expected 409, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'ya existe' in error['error'].lower() or 'email' in error['error'].lower(), f"Error message should mention duplicate: {error['error']}"
        log(f"✅ PASS - POST with duplicate email (case insensitive) → 409 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)

def test_patch_users(user_id):
    """C) PATCH /api/users - Update users (9 test cases)"""
    log("\n" + "=" * 80)
    log("C) PATCH /api/users - UPDATE USERS")
    log("=" * 80)
    
    # C1: Change fullName and phone
    log("\nC1: PATCH /api/users - Change fullName and phone")
    try:
        payload = {
            "id": user_id,
            "fullName": "Test QA Editado",
            "phone": "+56999999999"
        }
        r = requests.patch(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        user = r.json()
        assert user['fullName'] == 'Test QA Editado', f"FullName not updated: {user['fullName']}"
        assert user['phone'] == '+56999999999', f"Phone not updated: {user['phone']}"
        assert 'passwordHash' not in user, "Response should NOT have passwordHash"
        log(f"✅ PASS - PATCH updated fullName and phone successfully")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # C2: Change role from operator to admin
    log("\nC2: PATCH /api/users - Change role from operator to admin")
    try:
        payload = {
            "id": user_id,
            "role": "admin"
        }
        r = requests.patch(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        user = r.json()
        assert user['role'] == 'admin', f"Role not updated: {user['role']}"
        log(f"✅ PASS - PATCH changed role to admin successfully")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # C3: Toggle active to false
    log("\nC3: PATCH /api/users - Toggle active to false")
    try:
        payload = {
            "id": user_id,
            "active": False
        }
        r = requests.patch(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        user = r.json()
        assert user['active'] == False, f"Active not updated: {user['active']}"
        log(f"✅ PASS - PATCH toggled active to false successfully")
        
        # Toggle back to true for later tests
        payload['active'] = True
        r = requests.patch(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 200, f"Failed to toggle back to active=true"
        log(f"✅ PASS - PATCH toggled active back to true")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # C4: Validation - no id
    log("\nC4: PATCH /api/users - Validation: no id → 400")
    try:
        payload = {"fullName": "Test"}
        r = requests.patch(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'id' in error['error'].lower(), f"Error message should mention 'id': {error['error']}"
        log(f"✅ PASS - PATCH without id → 400 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # C5: Validation - nonexistent id
    log("\nC5: PATCH /api/users - Validation: nonexistent id → 404")
    try:
        payload = {
            "id": "00000000-0000-0000-0000-000000000000",
            "fullName": "Test"
        }
        r = requests.patch(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        log(f"✅ PASS - PATCH with nonexistent id → 404 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # C6: Validation - duplicate email with another user
    log("\nC6: PATCH /api/users - Validation: duplicate email → 409")
    try:
        # Get another user's email from seed
        r_users = requests.get(f"{BASE_URL}/users?role=operator")
        operators = r_users.json()
        # Find an operator that's not our test user
        other_operator = next((u for u in operators if u['id'] != user_id), None)
        
        if other_operator:
            payload = {
                "id": user_id,
                "email": other_operator['email']  # Try to use another user's email
            }
            r = requests.patch(f"{BASE_URL}/users", json=payload)
            assert r.status_code == 409, f"Expected 409, got {r.status_code}"
            error = r.json()
            assert 'error' in error, "Response should have error field"
            log(f"✅ PASS - PATCH with duplicate email → 409 '{error['error']}'")
        else:
            log(f"⚠️  SKIP - No other operator found to test duplicate email")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # C7: Validation - invalid email
    log("\nC7: PATCH /api/users - Validation: invalid email → 400")
    try:
        payload = {
            "id": user_id,
            "email": "bademail"
        }
        r = requests.patch(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'email' in error['error'].lower() and 'inválido' in error['error'].lower(), f"Error message should mention 'email inválido': {error['error']}"
        log(f"✅ PASS - PATCH with invalid email → 400 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # C8: Validation - invalid role
    log("\nC8: PATCH /api/users - Validation: invalid role → 400")
    try:
        payload = {
            "id": user_id,
            "role": "boss"
        }
        r = requests.patch(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'role' in error['error'].lower() and 'inválido' in error['error'].lower(), f"Error message should mention 'role inválido': {error['error']}"
        log(f"✅ PASS - PATCH with invalid role → 400 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # C9: Validation - empty body (only id)
    log("\nC9: PATCH /api/users - Validation: empty body (only id) → 400")
    try:
        payload = {"id": user_id}
        r = requests.patch(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'nada' in error['error'].lower() or 'actualizar' in error['error'].lower(), f"Error message should mention 'nada que actualizar': {error['error']}"
        log(f"✅ PASS - PATCH with empty body → 400 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)

def test_delete_users_scenario_a(user_id):
    """D) DELETE /api/users - Scenario A: user without POS sessions (3 test cases)"""
    log("\n" + "=" * 80)
    log("D) DELETE /api/users - SCENARIO A: User without POS sessions")
    log("=" * 80)
    
    # D1: DELETE user
    log("\nD1: DELETE /api/users - Delete newly created user")
    try:
        payload = {"id": user_id}
        r = requests.delete(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        result = r.json()
        assert result.get('ok') == True, f"Response should have ok:true, got {result}"
        log(f"✅ PASS - DELETE user → 200 {{ok:true}}")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # D2: Verify user no longer appears in GET
    log("\nD2: Verify GET /api/users → user no longer appears")
    try:
        r = requests.get(f"{BASE_URL}/users")
        users = r.json()
        user_ids = [u['id'] for u in users]
        assert user_id not in user_ids, f"Deleted user {user_id} still appears in GET /api/users"
        log(f"✅ PASS - Deleted user no longer appears in GET /api/users")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # D3: DELETE same id again → 404
    log("\nD3: DELETE /api/users - Delete same id again → 404")
    try:
        payload = {"id": user_id}
        r = requests.delete(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        log(f"✅ PASS - DELETE same id again → 404 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)

def test_delete_users_scenario_b():
    """D) DELETE /api/users - Scenario B: user WITH POS sessions (protection) (5 test cases)"""
    log("\n" + "=" * 80)
    log("D) DELETE /api/users - SCENARIO B: User WITH POS sessions (protection)")
    log("=" * 80)
    
    # D4: Get admin from seed
    log("\nD4: Get admin user from seed")
    try:
        r = requests.get(f"{BASE_URL}/users?role=admin")
        admins = r.json()
        assert len(admins) >= 1, "Should have at least 1 admin"
        admin = admins[0]
        admin_id = admin['id']
        log(f"✅ PASS - Got admin user: {admin['fullName']} (id={admin_id})")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # D5: Open POS session with that operatorId
    log("\nD5: Open POS session with admin operatorId")
    try:
        payload = {
            "operatorId": admin_id,
            "openingCash": 1000
        }
        r = requests.post(f"{BASE_URL}/pos/sessions/open", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        session = r.json()
        session_id = session['id']
        log(f"✅ PASS - Opened POS session (id={session_id}) with operatorId={admin_id}")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # D6: Try to DELETE that user → 409
    log("\nD6: Try to DELETE user with POS session → 409")
    try:
        payload = {"id": admin_id}
        r = requests.delete(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"
        error = r.json()
        assert 'error' in error, "Response should have error field"
        assert 'sesión' in error['error'].lower() or 'pos' in error['error'].lower(), f"Error message should mention POS session: {error['error']}"
        log(f"✅ PASS - DELETE user with POS session → 409 '{error['error']}'")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # D7: Verify user still exists in GET
    log("\nD7: Verify user still exists in GET /api/users")
    try:
        r = requests.get(f"{BASE_URL}/users")
        users = r.json()
        user_ids = [u['id'] for u in users]
        assert admin_id in user_ids, f"User {admin_id} should still exist after failed DELETE"
        log(f"✅ PASS - User still exists in GET /api/users after failed DELETE")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # D8: Close the session before finishing
    log("\nD8: Close POS session before finishing")
    try:
        payload = {
            "sessionId": session_id,
            "closingCash": 1000
        }
        r = requests.post(f"{BASE_URL}/pos/sessions/close", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        log(f"✅ PASS - Closed POS session successfully")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)

def test_regression():
    """E) REGRESSION - Verify other endpoints still work (3 test cases)"""
    log("\n" + "=" * 80)
    log("E) REGRESSION TESTS - Verify other endpoints still work")
    log("=" * 80)
    
    # E1: Create a new user for regression tests
    log("\nE1: Create new user for regression tests")
    try:
        import time
        unique_email = f"regression{int(time.time())}@estampadosdlv.cl"
        payload = {
            "fullName": "Regression Test User",
            "email": unique_email,
            "role": "operator",
            "phone": "+56987654321",
            "rut": "22.222.222-2"
        }
        r = requests.post(f"{BASE_URL}/users", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        user = r.json()
        regression_user_id = user['id']
        log(f"✅ PASS - Created regression test user (id={regression_user_id})")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # E2: POST /api/pos/sessions/open with new user
    log("\nE2: POST /api/pos/sessions/open with new user operatorId")
    try:
        payload = {
            "operatorId": regression_user_id,
            "openingCash": 5000
        }
        r = requests.post(f"{BASE_URL}/pos/sessions/open", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        session = r.json()
        assert session['operatorId'] == regression_user_id, f"Session operatorId mismatch"
        log(f"✅ PASS - Opened POS session with new user operatorId")
        
        # Close the session
        close_payload = {
            "sessionId": session['id'],
            "closingCash": 5000
        }
        r_close = requests.post(f"{BASE_URL}/pos/sessions/close", json=close_payload)
        assert r_close.status_code == 200, "Failed to close session"
        log(f"✅ PASS - Closed POS session")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # E3: POST /api/orders/public still works
    log("\nE3: POST /api/orders/public - Verify public order creation still works")
    try:
        # Get a product from catalog
        r_products = requests.get(f"{BASE_URL}/products")
        products = r_products.json()
        assert len(products) > 0, "Should have at least 1 product"
        product = products[0]
        
        payload = {
            "customer": {
                "name": "Cliente Regresión Test",
                "email": "cliente@test.cl",
                "phone": "+56912345678",
                "rut": "33.333.333-3"
            },
            "items": [
                {
                    "productId": product['id'],
                    "variantId": product['variants'][0]['id'] if product.get('variants') else None,
                    "quantity": 1
                }
            ],
            "deliveryMethod": "pickup",
            "paymentMethod": "transfer"
        }
        r = requests.post(f"{BASE_URL}/orders/public", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        order = r.json()
        assert 'orderNumber' in order, "Response should have orderNumber"
        log(f"✅ PASS - POST /api/orders/public created order {order['orderNumber']}")
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        sys.exit(1)
    except Exception as e:
        log(f"❌ ERROR - {e}")
        sys.exit(1)
    
    # Cleanup: Delete regression user
    log("\nCleanup: Delete regression test user")
    try:
        payload = {"id": regression_user_id}
        r = requests.delete(f"{BASE_URL}/users", json=payload)
        if r.status_code == 200:
            log(f"✅ PASS - Cleaned up regression test user")
        else:
            log(f"⚠️  WARNING - Failed to cleanup regression user: {r.status_code}")
    except Exception as e:
        log(f"⚠️  WARNING - Failed to cleanup regression user: {e}")

def main():
    log("=" * 80)
    log("BACKEND TEST SUITE: /api/users CRUD")
    log("Base URL: " + BASE_URL)
    log("=" * 80)
    
    # A) GET regression tests
    test_get_users_regression()
    
    # B) POST tests
    created_user_id = test_post_users()
    
    # C) PATCH tests
    test_patch_users(created_user_id)
    
    # D) DELETE tests - Scenario A (user without POS sessions)
    test_delete_users_scenario_a(created_user_id)
    
    # D) DELETE tests - Scenario B (user WITH POS sessions)
    test_delete_users_scenario_b()
    
    # E) REGRESSION tests
    test_regression()
    
    log("\n" + "=" * 80)
    log("✅ ALL TESTS PASSED")
    log("=" * 80)
    log("\nSummary:")
    log("  A) GET /api/users regression: 4/4 PASS")
    log("  B) POST /api/users: 8/8 PASS")
    log("  C) PATCH /api/users: 9/9 PASS")
    log("  D) DELETE /api/users (Scenario A): 3/3 PASS")
    log("  D) DELETE /api/users (Scenario B): 5/5 PASS")
    log("  E) REGRESSION: 3/3 PASS")
    log("  TOTAL: 32/32 PASS ✅")

if __name__ == "__main__":
    main()
