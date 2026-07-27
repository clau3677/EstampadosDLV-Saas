#!/usr/bin/env python3
"""
Backend test for Company/Bank Settings API endpoint (/api/settings/company)
Tests GET (public) and PUT (admin-only) operations with validation, whitelist, and merge logic.
"""
import requests
import json
import sys

BASE_URL = "https://dtf-print-hub-2.preview.emergentagent.com/api"
ADMIN_EMAIL = "estampadosdlv@gmail.com"
ADMIN_PASSWORD = "EstampadosDLV2025!"

# Expected default fields
DEFAULT_FIELDS = [
    'companyName', 'rut', 'bankName', 'accountType', 'accountNumber',
    'accountHolder', 'paymentEmail', 'contactEmail', 'contactPhone',
    'address', 'instructions'
]

def print_test(test_num, description):
    print(f"\n{'='*80}")
    print(f"TEST {test_num}: {description}")
    print('='*80)

def print_pass(message):
    print(f"✅ PASS: {message}")

def print_fail(message):
    print(f"❌ FAIL: {message}")
    
def print_info(message):
    print(f"ℹ️  INFO: {message}")

# ============================================================================
# Test 1: GET público sin auth — debe retornar todos los campos default
# ============================================================================
def test_1_get_public_without_auth():
    print_test(1, "GET público sin auth — debe retornar todos los campos default")
    
    try:
        response = requests.get(f"{BASE_URL}/settings/company", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print_fail(f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        # Verificar que todos los campos default están presentes
        missing_fields = [f for f in DEFAULT_FIELDS if f not in data]
        if missing_fields:
            print_fail(f"Missing default fields: {missing_fields}")
            return False
        
        print_pass(f"All {len(DEFAULT_FIELDS)} default fields present")
        print_info(f"Sample data: companyName='{data.get('companyName')}', bankName='{data.get('bankName')}'")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

# ============================================================================
# Test 2: PUT sin auth debe rechazar (403)
# ============================================================================
def test_2_put_without_auth_should_reject():
    print_test(2, "PUT sin auth debe rechazar (403)")
    
    try:
        payload = {"bankName": "Hack Bank"}
        response = requests.put(
            f"{BASE_URL}/settings/company",
            json=payload,
            timeout=10
        )
        print_info(f"Status: {response.status_code}")
        
        if response.status_code != 403:
            print_fail(f"Expected 403, got {response.status_code}")
            return False
        
        data = response.json()
        print_info(f"Response: {data}")
        
        if 'error' not in data or 'administradores' not in data['error'].lower():
            print_fail(f"Expected error message about 'administradores', got: {data}")
            return False
        
        print_pass("PUT without auth correctly rejected with 403")
        
        # Post-check: Verificar que NO se guardó "Hack Bank"
        get_response = requests.get(f"{BASE_URL}/settings/company", timeout=10)
        if get_response.status_code == 200:
            get_data = get_response.json()
            if get_data.get('bankName') == 'Hack Bank':
                print_fail("SECURITY ISSUE: 'Hack Bank' was saved despite 403!")
                return False
            print_pass("Post-check: 'Hack Bank' was NOT saved (security OK)")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

# ============================================================================
# Test 3: Login admin y PUT válido
# ============================================================================
def test_3_login_admin_and_put_valid():
    print_test(3, "Login admin y PUT válido")
    
    try:
        # Login
        login_response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10
        )
        print_info(f"Login status: {login_response.status_code}")
        
        if login_response.status_code != 200:
            print_fail(f"Login failed with status {login_response.status_code}")
            return False, None
        
        # Extraer cookie dlv_token
        cookies = login_response.cookies
        if 'dlv_token' not in cookies:
            print_fail("Cookie 'dlv_token' not found in login response")
            return False, None
        
        print_pass(f"Login successful, cookie obtained")
        
        # PUT con datos válidos
        payload = {
            "bankName": "Banco Test 2026",
            "accountNumber": "9999-8888-7777",
            "paymentEmail": "nuevo@ejemplo.cl"
        }
        
        put_response = requests.put(
            f"{BASE_URL}/settings/company",
            json=payload,
            cookies=cookies,
            timeout=10
        )
        print_info(f"PUT status: {put_response.status_code}")
        
        if put_response.status_code != 200:
            print_fail(f"Expected 200, got {put_response.status_code}")
            print_info(f"Response: {put_response.text}")
            return False, cookies
        
        data = put_response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        if not data.get('ok'):
            print_fail(f"Expected ok:true, got: {data}")
            return False, cookies
        
        if 'data' not in data:
            print_fail(f"Expected 'data' field in response, got: {data}")
            return False, cookies
        
        result_data = data['data']
        
        # Verificar que los 3 campos se actualizaron
        if result_data.get('bankName') != 'Banco Test 2026':
            print_fail(f"bankName not updated: {result_data.get('bankName')}")
            return False, cookies
        
        if result_data.get('accountNumber') != '9999-8888-7777':
            print_fail(f"accountNumber not updated: {result_data.get('accountNumber')}")
            return False, cookies
        
        if result_data.get('paymentEmail') != 'nuevo@ejemplo.cl':
            print_fail(f"paymentEmail not updated: {result_data.get('paymentEmail')}")
            return False, cookies
        
        print_pass("All 3 fields updated correctly")
        
        # Verificar que otros campos siguen siendo defaults (o los que estaban)
        if 'companyName' not in result_data:
            print_fail("companyName missing from response")
            return False, cookies
        
        print_pass(f"Other fields intact: companyName='{result_data.get('companyName')}'")
        
        return True, cookies
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False, None

# ============================================================================
# Test 4: Persistencia GET después de PUT
# ============================================================================
def test_4_persistence_get_after_put():
    print_test(4, "Persistencia GET después de PUT")
    
    try:
        response = requests.get(f"{BASE_URL}/settings/company", timeout=10)
        print_info(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print_fail(f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Verificar que los valores del Test 3 persisten
        if data.get('bankName') != 'Banco Test 2026':
            print_fail(f"bankName not persisted: {data.get('bankName')}")
            return False
        
        if data.get('accountNumber') != '9999-8888-7777':
            print_fail(f"accountNumber not persisted: {data.get('accountNumber')}")
            return False
        
        if data.get('paymentEmail') != 'nuevo@ejemplo.cl':
            print_fail(f"paymentEmail not persisted: {data.get('paymentEmail')}")
            return False
        
        print_pass("All 3 fields persisted correctly")
        
        # Verificar que otros campos siguen siendo defaults
        if 'companyName' not in data:
            print_fail("companyName missing")
            return False
        
        print_pass(f"Other fields still present: companyName='{data.get('companyName')}'")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

# ============================================================================
# Test 5: Merge no destructivo (PUT parcial)
# ============================================================================
def test_5_merge_non_destructive(cookies):
    print_test(5, "Merge no destructivo — PUT parcial NO borra otros campos")
    
    try:
        # PUT con solo companyName
        payload = {"companyName": "Nueva Razón Social SpA"}
        
        put_response = requests.put(
            f"{BASE_URL}/settings/company",
            json=payload,
            cookies=cookies,
            timeout=10
        )
        print_info(f"PUT status: {put_response.status_code}")
        
        if put_response.status_code != 200:
            print_fail(f"Expected 200, got {put_response.status_code}")
            return False
        
        # GET después
        get_response = requests.get(f"{BASE_URL}/settings/company", timeout=10)
        if get_response.status_code != 200:
            print_fail(f"GET failed with status {get_response.status_code}")
            return False
        
        data = get_response.json()
        
        # Verificar que companyName se actualizó
        if data.get('companyName') != 'Nueva Razón Social SpA':
            print_fail(f"companyName not updated: {data.get('companyName')}")
            return False
        
        print_pass("companyName updated correctly")
        
        # Verificar que bankName sigue siendo "Banco Test 2026" (del Test 3)
        if data.get('bankName') != 'Banco Test 2026':
            print_fail(f"bankName was overwritten! Expected 'Banco Test 2026', got: {data.get('bankName')}")
            return False
        
        print_pass("bankName still 'Banco Test 2026' (merge non-destructive working)")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

# ============================================================================
# Test 6: Whitelist de campos (rechazar campos no permitidos)
# ============================================================================
def test_6_whitelist_reject_evil_fields(cookies):
    print_test(6, "Whitelist de campos — rechazar campos no permitidos")
    
    try:
        # PUT con campos legítimos + campos maliciosos
        payload = {
            "bankName": "Banco Legit",
            "evilField": "pwned",
            "__proto__": "boom"
        }
        
        put_response = requests.put(
            f"{BASE_URL}/settings/company",
            json=payload,
            cookies=cookies,
            timeout=10
        )
        print_info(f"PUT status: {put_response.status_code}")
        
        if put_response.status_code != 200:
            print_fail(f"Expected 200, got {put_response.status_code}")
            return False
        
        # GET después
        get_response = requests.get(f"{BASE_URL}/settings/company", timeout=10)
        if get_response.status_code != 200:
            print_fail(f"GET failed with status {get_response.status_code}")
            return False
        
        data = get_response.json()
        
        # Verificar que bankName se guardó
        if data.get('bankName') != 'Banco Legit':
            print_fail(f"bankName not saved: {data.get('bankName')}")
            return False
        
        print_pass("bankName 'Banco Legit' saved correctly")
        
        # Verificar que evilField y __proto__ NO aparecen
        if 'evilField' in data:
            print_fail(f"SECURITY ISSUE: 'evilField' was saved! Value: {data['evilField']}")
            return False
        
        if '__proto__' in data:
            print_fail(f"SECURITY ISSUE: '__proto__' was saved! Value: {data['__proto__']}")
            return False
        
        print_pass("Evil fields 'evilField' and '__proto__' correctly rejected (whitelist working)")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

# ============================================================================
# Test 7: Trim de strings
# ============================================================================
def test_7_trim_strings(cookies):
    print_test(7, "Trim de strings — espacios en los bordes deben eliminarse")
    
    try:
        # PUT con espacios en los bordes
        payload = {"accountHolder": "   Con espacios   "}
        
        put_response = requests.put(
            f"{BASE_URL}/settings/company",
            json=payload,
            cookies=cookies,
            timeout=10
        )
        print_info(f"PUT status: {put_response.status_code}")
        
        if put_response.status_code != 200:
            print_fail(f"Expected 200, got {put_response.status_code}")
            return False
        
        # GET después
        get_response = requests.get(f"{BASE_URL}/settings/company", timeout=10)
        if get_response.status_code != 200:
            print_fail(f"GET failed with status {get_response.status_code}")
            return False
        
        data = get_response.json()
        
        # Verificar que accountHolder está trimmed
        if data.get('accountHolder') != 'Con espacios':
            print_fail(f"accountHolder not trimmed: '{data.get('accountHolder')}'")
            return False
        
        print_pass("accountHolder correctly trimmed: 'Con espacios' (no leading/trailing spaces)")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

# ============================================================================
# Reset: Restaurar valores default
# ============================================================================
def test_reset_to_defaults(cookies):
    print_test("RESET", "Restaurar valores default para no dejar BD en estado extraño")
    
    try:
        # PUT con valores default
        payload = {
            "companyName": "Estampados DLV SpA",
            "rut": "77.123.456-7",
            "bankName": "BancoEstado",
            "accountType": "Cuenta Vista",
            "accountNumber": "12345678",
            "accountHolder": "Estampados DLV SpA",
            "paymentEmail": "pagos@estampadosdlv.cl",
            "contactEmail": "contacto@estampadosdlv.cl",
            "contactPhone": "",
            "address": "",
            "instructions": ""
        }
        
        put_response = requests.put(
            f"{BASE_URL}/settings/company",
            json=payload,
            cookies=cookies,
            timeout=10
        )
        print_info(f"PUT status: {put_response.status_code}")
        
        if put_response.status_code != 200:
            print_fail(f"Reset failed with status {put_response.status_code}")
            return False
        
        print_pass("Settings reset to defaults successfully")
        
        # Verificar con GET
        get_response = requests.get(f"{BASE_URL}/settings/company", timeout=10)
        if get_response.status_code == 200:
            data = get_response.json()
            print_info(f"Verified: companyName='{data.get('companyName')}', bankName='{data.get('bankName')}'")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

# ============================================================================
# Main
# ============================================================================
def main():
    print("\n" + "="*80)
    print("BACKEND TEST: Company/Bank Settings API (/api/settings/company)")
    print("="*80)
    
    results = []
    
    # Test 1: GET público sin auth
    results.append(("Test 1: GET público sin auth", test_1_get_public_without_auth()))
    
    # Test 2: PUT sin auth debe rechazar
    results.append(("Test 2: PUT sin auth debe rechazar", test_2_put_without_auth_should_reject()))
    
    # Test 3: Login admin y PUT válido
    test3_result, cookies = test_3_login_admin_and_put_valid()
    results.append(("Test 3: Login admin y PUT válido", test3_result))
    
    if not test3_result or not cookies:
        print_fail("Test 3 failed, cannot continue with tests 4-7")
        print_summary(results)
        sys.exit(1)
    
    # Test 4: Persistencia GET después de PUT
    results.append(("Test 4: Persistencia GET después de PUT", test_4_persistence_get_after_put()))
    
    # Test 5: Merge no destructivo
    results.append(("Test 5: Merge no destructivo", test_5_merge_non_destructive(cookies)))
    
    # Test 6: Whitelist de campos
    results.append(("Test 6: Whitelist de campos", test_6_whitelist_reject_evil_fields(cookies)))
    
    # Test 7: Trim de strings
    results.append(("Test 7: Trim de strings", test_7_trim_strings(cookies)))
    
    # Reset
    results.append(("Reset: Restaurar defaults", test_reset_to_defaults(cookies)))
    
    # Summary
    print_summary(results)
    
    # Exit code
    all_passed = all(result for _, result in results)
    sys.exit(0 if all_passed else 1)

def print_summary(results):
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)

if __name__ == "__main__":
    main()
