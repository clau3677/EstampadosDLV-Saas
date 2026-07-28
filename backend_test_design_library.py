#!/usr/bin/env python3
"""
Backend Testing Suite for Estampados DLV - Design Library CRUD
Tests new /api/design-library/* endpoints + regression tests
"""

import requests
import json
import os
import re

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://dtf-print-hub-2.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

print(f"🧪 Testing Design Library CRUD at: {API_URL}\n")
print("=" * 80)

# Admin credentials
ADMIN_EMAIL = "estampadosdlv@gmail.com"
ADMIN_PASSWORD = "EstampadosDLV2025!"

# UUID v4 regex pattern
UUID_V4_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.IGNORECASE)

# Global variables
created_item_id = None
test_results = {
    'passed': 0,
    'failed': 0,
    'total': 0
}

def log_result(test_name, passed, message=""):
    """Log test result and update counters"""
    test_results['total'] += 1
    if passed:
        test_results['passed'] += 1
        print(f"✅ PASS - {test_name}")
    else:
        test_results['failed'] += 1
        print(f"❌ FAIL - {test_name}")
    if message:
        print(f"   {message}")

def is_valid_uuid_v4(uuid_str):
    """Validate UUID v4 format"""
    if not uuid_str or not isinstance(uuid_str, str):
        return False
    return UUID_V4_PATTERN.match(uuid_str) is not None

def check_no_mongo_id(data):
    """Recursively check for MongoDB _id in response"""
    if isinstance(data, dict):
        if '_id' in data:
            return True
        return any(check_no_mongo_id(v) for v in data.values())
    elif isinstance(data, list):
        return any(check_no_mongo_id(item) for item in data)
    return False

# ============================================================================
# SECTION A: DESIGN LIBRARY CRUD
# ============================================================================

print("\n📍 SECTION A: DESIGN LIBRARY CRUD")
print("=" * 80)

# A1: GET /api/design-library → 200, array (probably empty or with items)
print("\n[A1] GET /api/design-library - List all design templates")
try:
    response = requests.get(f"{API_URL}/design-library", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        log_result("A1 - GET /api/design-library returns 200", True, f"Received {len(data)} items")
        
        # Verify it's an array
        if isinstance(data, list):
            log_result("A1 - Response is array", True)
        else:
            log_result("A1 - Response is array", False, f"Expected array, got {type(data)}")
        
        # Check for MongoDB _id
        if check_no_mongo_id(data):
            log_result("A1 - No MongoDB _id leak", False, "Found _id in response")
        else:
            log_result("A1 - No MongoDB _id leak", True)
    else:
        log_result("A1 - GET /api/design-library returns 200", False, f"Got {response.status_code}: {response.text[:200]}")
except Exception as e:
    log_result("A1 - GET /api/design-library", False, f"Exception: {str(e)}")

# A2: POST /api/design-library with valid body
print("\n[A2] POST /api/design-library - Create design template with valid payload")
try:
    payload = {
        "name": "Logo Test",
        "imageUrl": "/uploads/test-logo.png",
        "srcWidthPx": 800,
        "srcHeightPx": 600,
        "tags": ["logo", "test"]
    }
    response = requests.post(f"{API_URL}/design-library", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        log_result("A2 - POST /api/design-library returns 200", True)
        
        # Verify UUID v4 id
        if 'id' in data and is_valid_uuid_v4(data['id']):
            created_item_id = data['id']
            log_result("A2 - Response has valid UUID v4 id", True, f"id: {data['id']}")
        else:
            log_result("A2 - Response has valid UUID v4 id", False, f"Invalid or missing id: {data.get('id')}")
        
        # Verify fields
        expected_fields = {
            'name': 'Logo Test',
            'imageUrl': '/uploads/test-logo.png',
            'srcWidthPx': 800,
            'srcHeightPx': 600,
            'active': True,
            'uses': 0
        }
        
        all_fields_correct = True
        for field, expected_value in expected_fields.items():
            if data.get(field) != expected_value:
                all_fields_correct = False
                print(f"   Field '{field}': expected {expected_value}, got {data.get(field)}")
        
        if all_fields_correct:
            log_result("A2 - All fields correct", True)
        else:
            log_result("A2 - All fields correct", False)
        
        # Verify tags
        if data.get('tags') == ["logo", "test"]:
            log_result("A2 - Tags correct", True)
        else:
            log_result("A2 - Tags correct", False, f"Expected ['logo', 'test'], got {data.get('tags')}")
        
        # Verify timestamps
        if 'createdAt' in data and 'updatedAt' in data:
            log_result("A2 - Has timestamps", True)
        else:
            log_result("A2 - Has timestamps", False)
        
        # Check for MongoDB _id
        if '_id' in data:
            log_result("A2 - No MongoDB _id leak", False, "Found _id in response")
        else:
            log_result("A2 - No MongoDB _id leak", True)
        
        # Save the created ID for later tests
        if 'id' in data:
            created_item_id = data['id']
    else:
        log_result("A2 - POST /api/design-library returns 200", False, f"Got {response.status_code}: {response.text[:200]}")
except Exception as e:
    log_result("A2 - POST /api/design-library", False, f"Exception: {str(e)}")

# A3: POST /api/design-library without body → 400
print("\n[A3] POST /api/design-library - Validation: empty body")
try:
    response = requests.post(f"{API_URL}/design-library", json={}, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        data = response.json()
        if 'name e imageUrl son requeridos' in data.get('error', ''):
            log_result("A3 - Validation: empty body returns 400", True, f"Error message: {data.get('error')}")
        else:
            log_result("A3 - Validation: empty body returns 400", True, f"Got 400 but different message: {data.get('error')}")
    else:
        log_result("A3 - Validation: empty body returns 400", False, f"Expected 400, got {response.status_code}")
except Exception as e:
    log_result("A3 - Validation: empty body", False, f"Exception: {str(e)}")

# A4: POST /api/design-library with only name → 400
print("\n[A4] POST /api/design-library - Validation: missing imageUrl")
try:
    payload = {"name": "Solo nombre"}
    response = requests.post(f"{API_URL}/design-library", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        data = response.json()
        if 'name e imageUrl son requeridos' in data.get('error', ''):
            log_result("A4 - Validation: missing imageUrl returns 400", True, f"Error message: {data.get('error')}")
        else:
            log_result("A4 - Validation: missing imageUrl returns 400", True, f"Got 400 but different message: {data.get('error')}")
    else:
        log_result("A4 - Validation: missing imageUrl returns 400", False, f"Expected 400, got {response.status_code}")
except Exception as e:
    log_result("A4 - Validation: missing imageUrl", False, f"Exception: {str(e)}")

# A5: POST /api/design-library with only imageUrl → 400
print("\n[A5] POST /api/design-library - Validation: missing name")
try:
    payload = {"imageUrl": "/uploads/x.png"}
    response = requests.post(f"{API_URL}/design-library", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        data = response.json()
        if 'name e imageUrl son requeridos' in data.get('error', ''):
            log_result("A5 - Validation: missing name returns 400", True, f"Error message: {data.get('error')}")
        else:
            log_result("A5 - Validation: missing name returns 400", True, f"Got 400 but different message: {data.get('error')}")
    else:
        log_result("A5 - Validation: missing name returns 400", False, f"Expected 400, got {response.status_code}")
except Exception as e:
    log_result("A5 - Validation: missing name", False, f"Exception: {str(e)}")

# A6: GET /api/design-library → should now have at least 1 item
print("\n[A6] GET /api/design-library - Verify created item appears in list")
try:
    response = requests.get(f"{API_URL}/design-library", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        if len(data) >= 1:
            log_result("A6 - List has at least 1 item", True, f"Found {len(data)} items")
            
            # Find our created item
            our_item = next((item for item in data if item.get('id') == created_item_id), None)
            if our_item:
                log_result("A6 - Created item found in list", True, f"Found item with id {created_item_id}")
            else:
                log_result("A6 - Created item found in list", False, f"Item with id {created_item_id} not found")
        else:
            log_result("A6 - List has at least 1 item", False, f"Expected at least 1 item, got {len(data)}")
    else:
        log_result("A6 - GET /api/design-library", False, f"Expected 200, got {response.status_code}")
except Exception as e:
    log_result("A6 - GET /api/design-library", False, f"Exception: {str(e)}")

# A7: GET /api/design-library?tag=logo → should filter correctly
print("\n[A7] GET /api/design-library?tag=logo - Filter by tag")
try:
    response = requests.get(f"{API_URL}/design-library?tag=logo", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        log_result("A7 - Filter by tag returns 200", True, f"Found {len(data)} items with tag 'logo'")
        
        # Verify all items have the tag
        all_have_tag = all('logo' in item.get('tags', []) for item in data)
        if all_have_tag:
            log_result("A7 - All items have tag 'logo'", True)
        else:
            log_result("A7 - All items have tag 'logo'", False)
        
        # Our item should be in the list
        our_item = next((item for item in data if item.get('id') == created_item_id), None)
        if our_item:
            log_result("A7 - Created item found in filtered list", True)
        else:
            log_result("A7 - Created item found in filtered list", False)
    else:
        log_result("A7 - Filter by tag", False, f"Expected 200, got {response.status_code}")
except Exception as e:
    log_result("A7 - Filter by tag", False, f"Exception: {str(e)}")

# A8: GET /api/design-library?tag=inexistente-xyz → should return empty array
print("\n[A8] GET /api/design-library?tag=inexistente-xyz - Filter by non-existent tag")
try:
    response = requests.get(f"{API_URL}/design-library?tag=inexistente-xyz", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        if len(data) == 0:
            log_result("A8 - Non-existent tag returns empty array", True)
        else:
            log_result("A8 - Non-existent tag returns empty array", False, f"Expected empty array, got {len(data)} items")
    else:
        log_result("A8 - Filter by non-existent tag", False, f"Expected 200, got {response.status_code}")
except Exception as e:
    log_result("A8 - Filter by non-existent tag", False, f"Exception: {str(e)}")

# A9: PUT /api/design-library/:id with update
print("\n[A9] PUT /api/design-library/:id - Update design template")
if created_item_id:
    try:
        payload = {
            "name": "Logo Actualizado",
            "tags": ["updated"]
        }
        response = requests.put(f"{API_URL}/design-library/{created_item_id}", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            log_result("A9 - PUT /api/design-library/:id returns 200", True)
            
            # Verify updated fields
            if data.get('name') == 'Logo Actualizado':
                log_result("A9 - Name updated correctly", True)
            else:
                log_result("A9 - Name updated correctly", False, f"Expected 'Logo Actualizado', got {data.get('name')}")
            
            if data.get('tags') == ['updated']:
                log_result("A9 - Tags updated correctly", True)
            else:
                log_result("A9 - Tags updated correctly", False, f"Expected ['updated'], got {data.get('tags')}")
            
            # Verify updatedAt changed
            if 'updatedAt' in data:
                log_result("A9 - updatedAt field present", True)
            else:
                log_result("A9 - updatedAt field present", False)
        else:
            log_result("A9 - PUT /api/design-library/:id", False, f"Expected 200, got {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_result("A9 - PUT /api/design-library/:id", False, f"Exception: {str(e)}")
else:
    log_result("A9 - PUT /api/design-library/:id", False, "No created_item_id available")

# A10: PUT /api/design-library/no-existe → 404
print("\n[A10] PUT /api/design-library/no-existe - Update non-existent item")
try:
    payload = {"name": "Test"}
    response = requests.put(f"{API_URL}/design-library/00000000-0000-4000-8000-000000000000", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 404:
        data = response.json()
        if 'no encontrado' in data.get('error', ''):
            log_result("A10 - Update non-existent item returns 404", True, f"Error message: {data.get('error')}")
        else:
            log_result("A10 - Update non-existent item returns 404", True, f"Got 404 but different message: {data.get('error')}")
    else:
        log_result("A10 - Update non-existent item returns 404", False, f"Expected 404, got {response.status_code}")
except Exception as e:
    log_result("A10 - Update non-existent item", False, f"Exception: {str(e)}")

# A11: POST /api/design-library/:id/use → increment uses counter
print("\n[A11] POST /api/design-library/:id/use - Increment uses counter")
if created_item_id:
    try:
        response = requests.post(f"{API_URL}/design-library/{created_item_id}/use", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok') == True:
                log_result("A11 - POST /use returns 200 with ok:true", True)
            else:
                log_result("A11 - POST /use returns 200 with ok:true", False, f"Expected ok:true, got {data}")
        else:
            log_result("A11 - POST /use", False, f"Expected 200, got {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_result("A11 - POST /use", False, f"Exception: {str(e)}")
else:
    log_result("A11 - POST /use", False, "No created_item_id available")

# A12: GET /api/design-library → verify uses counter incremented
print("\n[A12] GET /api/design-library - Verify uses counter incremented")
if created_item_id:
    try:
        response = requests.get(f"{API_URL}/design-library", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            our_item = next((item for item in data if item.get('id') == created_item_id), None)
            
            if our_item:
                if our_item.get('uses') == 1:
                    log_result("A12 - Uses counter incremented to 1", True)
                else:
                    log_result("A12 - Uses counter incremented to 1", False, f"Expected uses=1, got {our_item.get('uses')}")
            else:
                log_result("A12 - Find item in list", False, f"Item with id {created_item_id} not found")
        else:
            log_result("A12 - GET /api/design-library", False, f"Expected 200, got {response.status_code}")
    except Exception as e:
        log_result("A12 - Verify uses counter", False, f"Exception: {str(e)}")
else:
    log_result("A12 - Verify uses counter", False, "No created_item_id available")

# A13: DELETE /api/design-library/:id → 200
print("\n[A13] DELETE /api/design-library/:id - Delete design template")
if created_item_id:
    try:
        response = requests.delete(f"{API_URL}/design-library/{created_item_id}", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok') == True and data.get('id') == created_item_id:
                log_result("A13 - DELETE returns 200 with ok:true and id", True)
            else:
                log_result("A13 - DELETE returns 200 with ok:true and id", False, f"Expected ok:true and id:{created_item_id}, got {data}")
        else:
            log_result("A13 - DELETE /api/design-library/:id", False, f"Expected 200, got {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_result("A13 - DELETE /api/design-library/:id", False, f"Exception: {str(e)}")
else:
    log_result("A13 - DELETE /api/design-library/:id", False, "No created_item_id available")

# A14: DELETE /api/design-library/no-existe → 404
print("\n[A14] DELETE /api/design-library/no-existe - Delete non-existent item")
try:
    response = requests.delete(f"{API_URL}/design-library/00000000-0000-4000-8000-000000000000", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 404:
        data = response.json()
        if 'no encontrado' in data.get('error', ''):
            log_result("A14 - Delete non-existent item returns 404", True, f"Error message: {data.get('error')}")
        else:
            log_result("A14 - Delete non-existent item returns 404", True, f"Got 404 but different message: {data.get('error')}")
    else:
        log_result("A14 - Delete non-existent item returns 404", False, f"Expected 404, got {response.status_code}")
except Exception as e:
    log_result("A14 - Delete non-existent item", False, f"Exception: {str(e)}")

# A15: GET /api/design-library → verify item deleted
print("\n[A15] GET /api/design-library - Verify item deleted")
if created_item_id:
    try:
        response = requests.get(f"{API_URL}/design-library", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            our_item = next((item for item in data if item.get('id') == created_item_id), None)
            
            if our_item is None:
                log_result("A15 - Deleted item not in list", True)
            else:
                log_result("A15 - Deleted item not in list", False, f"Item with id {created_item_id} still found in list")
        else:
            log_result("A15 - GET /api/design-library", False, f"Expected 200, got {response.status_code}")
    except Exception as e:
        log_result("A15 - Verify item deleted", False, f"Exception: {str(e)}")
else:
    log_result("A15 - Verify item deleted", False, "No created_item_id available")

# ============================================================================
# SECTION B: REGRESSION - GANG SHEETS
# ============================================================================

print("\n📍 SECTION B: REGRESSION - GANG SHEETS")
print("=" * 80)

# B1: GET /api/dashboard/summary
print("\n[B1] GET /api/dashboard/summary - Verify dashboard still works")
try:
    response = requests.get(f"{API_URL}/dashboard/summary", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        log_result("B1 - GET /api/dashboard/summary returns 200", True)
        
        # Verify expected fields
        expected_fields = ['salesToday', 'pendingOrders', 'printerQueues', 'recentActivity']
        missing_fields = [f for f in expected_fields if f not in data]
        
        if not missing_fields:
            log_result("B1 - Dashboard has expected fields", True)
        else:
            log_result("B1 - Dashboard has expected fields", False, f"Missing fields: {missing_fields}")
    else:
        log_result("B1 - GET /api/dashboard/summary", False, f"Expected 200, got {response.status_code}")
except Exception as e:
    log_result("B1 - GET /api/dashboard/summary", False, f"Exception: {str(e)}")

# B2: GET /api/products
print("\n[B2] GET /api/products - Verify products endpoint still works")
try:
    response = requests.get(f"{API_URL}/products", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        log_result("B2 - GET /api/products returns 200", True, f"Found {len(data)} products")
        
        # Check for MongoDB _id
        if check_no_mongo_id(data):
            log_result("B2 - No MongoDB _id leak", False, "Found _id in response")
        else:
            log_result("B2 - No MongoDB _id leak", True)
    else:
        log_result("B2 - GET /api/products", False, f"Expected 200, got {response.status_code}")
except Exception as e:
    log_result("B2 - GET /api/products", False, f"Exception: {str(e)}")

# B3: GET /api/settings/company
print("\n[B3] GET /api/settings/company - Verify settings endpoint still works")
try:
    response = requests.get(f"{API_URL}/settings/company", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        log_result("B3 - GET /api/settings/company returns 200", True)
        
        # Verify expected fields
        if 'name' in data or 'rut' in data:
            log_result("B3 - Company settings has expected fields", True)
        else:
            log_result("B3 - Company settings has expected fields", False, "Missing name or rut fields")
    else:
        log_result("B3 - GET /api/settings/company", False, f"Expected 200, got {response.status_code}")
except Exception as e:
    log_result("B3 - GET /api/settings/company", False, f"Exception: {str(e)}")

# B4: GET /api/orders (if exists)
print("\n[B4] GET /api/orders - Verify orders endpoint still works")
try:
    response = requests.get(f"{API_URL}/orders", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        log_result("B4 - GET /api/orders returns 200", True, f"Found {len(data)} orders")
        
        # Check for MongoDB _id
        if check_no_mongo_id(data):
            log_result("B4 - No MongoDB _id leak", False, "Found _id in response")
        else:
            log_result("B4 - No MongoDB _id leak", True)
    else:
        log_result("B4 - GET /api/orders", False, f"Expected 200, got {response.status_code}")
except Exception as e:
    log_result("B4 - GET /api/orders", False, f"Exception: {str(e)}")

# ============================================================================
# SECTION C: PAYMENT STATUS VERIFICATION
# ============================================================================

print("\n📍 SECTION C: PAYMENT STATUS VERIFICATION")
print("=" * 80)

# C1: GET /api/payments/status
print("\n[C1] GET /api/payments/status - Verify payment status endpoint")
try:
    response = requests.get(f"{API_URL}/payments/status", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        log_result("C1 - GET /api/payments/status returns 200", True)
        
        # Verify expected structure {webpay, mercadopago, transfer, cash}
        expected_keys = ['webpay', 'mercadopago', 'transfer', 'cash']
        missing_keys = [k for k in expected_keys if k not in data]
        
        if not missing_keys:
            log_result("C1 - Payment status has expected structure", True, f"Keys: {list(data.keys())}")
        else:
            log_result("C1 - Payment status has expected structure", False, f"Missing keys: {missing_keys}")
    else:
        log_result("C1 - GET /api/payments/status", False, f"Expected 200, got {response.status_code}")
except Exception as e:
    log_result("C1 - GET /api/payments/status", False, f"Exception: {str(e)}")

# ============================================================================
# SUMMARY
# ============================================================================

print("\n" + "=" * 80)
print("📊 TEST SUMMARY")
print("=" * 80)
print(f"Total tests: {test_results['total']}")
print(f"✅ Passed: {test_results['passed']}")
print(f"❌ Failed: {test_results['failed']}")
print(f"Success rate: {(test_results['passed'] / test_results['total'] * 100):.1f}%")
print("=" * 80)

if test_results['failed'] == 0:
    print("\n🎉 ALL TESTS PASSED!")
else:
    print(f"\n⚠️  {test_results['failed']} test(s) failed. Please review the output above.")
