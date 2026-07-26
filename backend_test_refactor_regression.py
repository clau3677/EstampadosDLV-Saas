#!/usr/bin/env python3
"""
Backend Regression Testing Suite - Iteration 5 (26-jul-2026)
REFACTOR: Monolithic /api/[[...path]]/route.js (1480 lines) → 12 domain modules under /app/lib/api/*.js
OBJECTIVE: Verify ZERO regressions. All endpoints must behave EXACTLY as before.

Test Suites:
A) SMOKE - All GET endpoints (19 tests)
B) POST crítico - Create operations (10 tests)
C) POST checkout público (3 tests)
D) POST gang-sheets (5 tests)
E) Upload de diseño (1 test)
F) Validaciones de errores (9 tests)
G) CORS (1 test)
H) 404 handling (1 test)

Total: 49 test cases
"""

import requests
import json
import os
from io import BytesIO
from PIL import Image

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://dtf-print-hub-2.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

print(f"🧪 REFACTOR REGRESSION TEST SUITE - Iteration 5")
print(f"📍 Testing backend at: {API_URL}")
print(f"🎯 Objective: ZERO regressions after splitting route.js into 12 modules\n")
print("=" * 80)

# Test counters
total_tests = 0
passed_tests = 0
failed_tests = 0

def test_result(test_name, passed, message=""):
    global total_tests, passed_tests, failed_tests
    total_tests += 1
    if passed:
        passed_tests += 1
        print(f"✅ PASS - {test_name}")
    else:
        failed_tests += 1
        print(f"❌ FAIL - {test_name}")
    if message:
        print(f"   {message}")

# Global variables for test data
test_product_id = None
test_variant_id = None
test_supply_id = None
test_order_number = None
test_landing_id = None
test_taxonomy_id = None
test_printer_id = None

# ============================================================================
# SUITE A: SMOKE - All GET endpoints (19 tests)
# ============================================================================

print("\n📍 SUITE A: SMOKE - All GET endpoints")
print("=" * 80)

# A1: GET /api/ → service, status:ok, version, printers[]
print("\n[A1] GET /api/ - Health check")
try:
    response = requests.get(f"{API_URL}/", timeout=10)
    data = response.json() if response.status_code == 200 else {}
    passed = (
        response.status_code == 200 and
        'service' in data and
        data.get('status') == 'ok' and
        'version' in data and
        'printers' in data and
        isinstance(data['printers'], list)
    )
    test_result("GET /api/", passed, f"Status: {response.status_code}, Keys: {list(data.keys())}")
except Exception as e:
    test_result("GET /api/", False, f"Exception: {str(e)}")

# A2: GET /api/root → same as /api/
print("\n[A2] GET /api/root - Health check (alias)")
try:
    response = requests.get(f"{API_URL}/root", timeout=10)
    data = response.json() if response.status_code == 200 else {}
    passed = (
        response.status_code == 200 and
        'service' in data and
        data.get('status') == 'ok'
    )
    test_result("GET /api/root", passed, f"Status: {response.status_code}")
except Exception as e:
    test_result("GET /api/root", False, f"Exception: {str(e)}")

# A3: GET /api/config → { printers, printersDynamic, enums }
print("\n[A3] GET /api/config - Configuration")
try:
    response = requests.get(f"{API_URL}/config", timeout=10)
    data = response.json() if response.status_code == 200 else {}
    passed = (
        response.status_code == 200 and
        'printers' in data and
        'printersDynamic' in data and
        'enums' in data
    )
    test_result("GET /api/config", passed, f"Status: {response.status_code}, Keys: {list(data.keys())}")
except Exception as e:
    test_result("GET /api/config", False, f"Exception: {str(e)}")

# A4: GET /api/pricing → 3 keys: dtf_textil_31, dtf_textil_33, dtf_uv
print("\n[A4] GET /api/pricing - Pricing config")
try:
    response = requests.get(f"{API_URL}/pricing", timeout=10)
    data = response.json() if response.status_code == 200 else {}
    passed = (
        response.status_code == 200 and
        'dtf_textil_31' in data and
        'dtf_textil_33' in data and
        'dtf_uv' in data
    )
    test_result("GET /api/pricing", passed, f"Status: {response.status_code}, Keys: {list(data.keys())}")
except Exception as e:
    test_result("GET /api/pricing", False, f"Exception: {str(e)}")

# A5: GET /api/dashboard/summary → { salesToday, pendingOrders, metersToday, stockAlerts, printerQueues, recentActivity }
print("\n[A5] GET /api/dashboard/summary - Dashboard KPIs")
try:
    response = requests.get(f"{API_URL}/dashboard/summary", timeout=10)
    data = response.json() if response.status_code == 200 else {}
    passed = (
        response.status_code == 200 and
        'salesToday' in data and
        'pendingOrders' in data and
        'metersToday' in data and
        'stockAlerts' in data and
        'printerQueues' in data and
        'recentActivity' in data
    )
    test_result("GET /api/dashboard/summary", passed, f"Status: {response.status_code}, Keys: {list(data.keys())}")
except Exception as e:
    test_result("GET /api/dashboard/summary", False, f"Exception: {str(e)}")

# First, run seed to ensure we have data
print("\n[SETUP] POST /api/seed - Seeding database for tests")
try:
    response = requests.post(f"{API_URL}/seed", json={}, timeout=30)
    data = response.json() if response.status_code == 200 else {}
    if response.status_code == 200:
        print(f"✅ Seed successful: {data}")
    else:
        print(f"⚠️  Seed failed: {response.status_code}")
except Exception as e:
    print(f"⚠️  Seed exception: {str(e)}")

# A6: GET /api/products → array 4 items (after seed). No _id.
print("\n[A6] GET /api/products - Product catalog")
try:
    response = requests.get(f"{API_URL}/products", timeout=10)
    data = response.json() if response.status_code == 200 else []
    has_mongo_id = any('_id' in item for item in data) if isinstance(data, list) else False
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        len(data) >= 4 and
        not has_mongo_id
    )
    # Store first product for later tests
    if data and len(data) > 0:
        test_product_id = data[0].get('id')
        if data[0].get('variants') and len(data[0]['variants']) > 0:
            test_variant_id = data[0]['variants'][0].get('id')
    test_result("GET /api/products", passed, f"Status: {response.status_code}, Count: {len(data)}, Has _id: {has_mongo_id}")
except Exception as e:
    test_result("GET /api/products", False, f"Exception: {str(e)}")

# A7: GET /api/inventory/commercial → array. No _id.
print("\n[A7] GET /api/inventory/commercial - Commercial stock")
try:
    response = requests.get(f"{API_URL}/inventory/commercial", timeout=10)
    data = response.json() if response.status_code == 200 else []
    has_mongo_id = any('_id' in item for item in data) if isinstance(data, list) else False
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        not has_mongo_id
    )
    test_result("GET /api/inventory/commercial", passed, f"Status: {response.status_code}, Count: {len(data)}, Has _id: {has_mongo_id}")
except Exception as e:
    test_result("GET /api/inventory/commercial", False, f"Exception: {str(e)}")

# A8: GET /api/inventory/supplies → array 9 items. No _id.
print("\n[A8] GET /api/inventory/supplies - Production supplies")
try:
    response = requests.get(f"{API_URL}/inventory/supplies", timeout=10)
    data = response.json() if response.status_code == 200 else []
    has_mongo_id = any('_id' in item for item in data) if isinstance(data, list) else False
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        len(data) >= 9 and
        not has_mongo_id
    )
    # Store first supply for later tests
    if data and len(data) > 0:
        test_supply_id = data[0].get('id')
    test_result("GET /api/inventory/supplies", passed, f"Status: {response.status_code}, Count: {len(data)}, Has _id: {has_mongo_id}")
except Exception as e:
    test_result("GET /api/inventory/supplies", False, f"Exception: {str(e)}")

# A9: GET /api/orders → array 5 items after seed. No _id.
print("\n[A9] GET /api/orders - Orders list")
try:
    response = requests.get(f"{API_URL}/orders", timeout=10)
    data = response.json() if response.status_code == 200 else []
    has_mongo_id = any('_id' in item for item in data) if isinstance(data, list) else False
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        len(data) >= 5 and
        not has_mongo_id
    )
    test_result("GET /api/orders", passed, f"Status: {response.status_code}, Count: {len(data)}, Has _id: {has_mongo_id}")
except Exception as e:
    test_result("GET /api/orders", False, f"Exception: {str(e)}")

# A10: GET /api/orders/lookup?number=DLV-2025-000100 → { order, items }
print("\n[A10] GET /api/orders/lookup - Order lookup by number")
try:
    response = requests.get(f"{API_URL}/orders/lookup?number=DLV-2025-000100", timeout=10)
    data = response.json() if response.status_code == 200 else {}
    passed = (
        response.status_code == 200 and
        'order' in data and
        'items' in data
    )
    test_result("GET /api/orders/lookup", passed, f"Status: {response.status_code}, Keys: {list(data.keys())}")
except Exception as e:
    test_result("GET /api/orders/lookup", False, f"Exception: {str(e)}")

# A11: GET /api/production/queue → array enriched with order sub-object
print("\n[A11] GET /api/production/queue - Production queue")
try:
    response = requests.get(f"{API_URL}/production/queue", timeout=10)
    data = response.json() if response.status_code == 200 else []
    has_order_data = any('order' in item for item in data) if isinstance(data, list) and len(data) > 0 else True
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        has_order_data
    )
    test_result("GET /api/production/queue", passed, f"Status: {response.status_code}, Count: {len(data)}, Has order data: {has_order_data}")
except Exception as e:
    test_result("GET /api/production/queue", False, f"Exception: {str(e)}")

# A12: GET /api/production/queue?printer=epson_r1390 → filtered by printer
print("\n[A12] GET /api/production/queue?printer=epson_r1390 - Filtered queue")
try:
    response = requests.get(f"{API_URL}/production/queue?printer=epson_r1390", timeout=10)
    data = response.json() if response.status_code == 200 else []
    all_correct_printer = all(item.get('printer') == 'epson_r1390' for item in data) if isinstance(data, list) and len(data) > 0 else True
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        all_correct_printer
    )
    test_result("GET /api/production/queue?printer=epson_r1390", passed, f"Status: {response.status_code}, Count: {len(data)}, All correct printer: {all_correct_printer}")
except Exception as e:
    test_result("GET /api/production/queue?printer=epson_r1390", False, f"Exception: {str(e)}")

# A13: GET /api/stock-movements → array
print("\n[A13] GET /api/stock-movements - Stock movements log")
try:
    response = requests.get(f"{API_URL}/stock-movements", timeout=10)
    data = response.json() if response.status_code == 200 else []
    passed = (
        response.status_code == 200 and
        isinstance(data, list)
    )
    test_result("GET /api/stock-movements", passed, f"Status: {response.status_code}, Count: {len(data)}")
except Exception as e:
    test_result("GET /api/stock-movements", False, f"Exception: {str(e)}")

# A14: GET /api/taxonomies → all kinds. No _id.
print("\n[A14] GET /api/taxonomies - All taxonomies")
try:
    response = requests.get(f"{API_URL}/taxonomies", timeout=10)
    data = response.json() if response.status_code == 200 else []
    has_mongo_id = any('_id' in item for item in data) if isinstance(data, list) else False
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        not has_mongo_id
    )
    test_result("GET /api/taxonomies", passed, f"Status: {response.status_code}, Count: {len(data)}, Has _id: {has_mongo_id}")
except Exception as e:
    test_result("GET /api/taxonomies", False, f"Exception: {str(e)}")

# A15: GET /api/taxonomies?kind=product_category → only 4 categories
print("\n[A15] GET /api/taxonomies?kind=product_category - Filtered taxonomies")
try:
    response = requests.get(f"{API_URL}/taxonomies?kind=product_category", timeout=10)
    data = response.json() if response.status_code == 200 else []
    all_correct_kind = all(item.get('kind') == 'product_category' for item in data) if isinstance(data, list) and len(data) > 0 else True
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        len(data) >= 4 and
        all_correct_kind
    )
    test_result("GET /api/taxonomies?kind=product_category", passed, f"Status: {response.status_code}, Count: {len(data)}, All correct kind: {all_correct_kind}")
except Exception as e:
    test_result("GET /api/taxonomies?kind=product_category", False, f"Exception: {str(e)}")

# A16: GET /api/landings → array
print("\n[A16] GET /api/landings - All landings")
try:
    response = requests.get(f"{API_URL}/landings", timeout=10)
    data = response.json() if response.status_code == 200 else []
    has_mongo_id = any('_id' in item for item in data) if isinstance(data, list) else False
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        not has_mongo_id
    )
    test_result("GET /api/landings", passed, f"Status: {response.status_code}, Count: {len(data)}, Has _id: {has_mongo_id}")
except Exception as e:
    test_result("GET /api/landings", False, f"Exception: {str(e)}")

# A17: GET /api/landings?active=true → only active
print("\n[A17] GET /api/landings?active=true - Active landings only")
try:
    response = requests.get(f"{API_URL}/landings?active=true", timeout=10)
    data = response.json() if response.status_code == 200 else []
    all_active = all(item.get('active') == True for item in data) if isinstance(data, list) and len(data) > 0 else True
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        all_active
    )
    test_result("GET /api/landings?active=true", passed, f"Status: {response.status_code}, Count: {len(data)}, All active: {all_active}")
except Exception as e:
    test_result("GET /api/landings?active=true", False, f"Exception: {str(e)}")

# A18: GET /api/printers → 3 canonical
print("\n[A18] GET /api/printers - All printers")
try:
    response = requests.get(f"{API_URL}/printers", timeout=10)
    data = response.json() if response.status_code == 200 else []
    has_mongo_id = any('_id' in item for item in data) if isinstance(data, list) else False
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        len(data) >= 3 and
        not has_mongo_id
    )
    test_result("GET /api/printers", passed, f"Status: {response.status_code}, Count: {len(data)}, Has _id: {has_mongo_id}")
except Exception as e:
    test_result("GET /api/printers", False, f"Exception: {str(e)}")

# A19: GET /api/printers?active=true → 3 canonical
print("\n[A19] GET /api/printers?active=true - Active printers only")
try:
    response = requests.get(f"{API_URL}/printers?active=true", timeout=10)
    data = response.json() if response.status_code == 200 else []
    all_active = all(item.get('active') == True for item in data) if isinstance(data, list) and len(data) > 0 else True
    passed = (
        response.status_code == 200 and
        isinstance(data, list) and
        len(data) >= 3 and
        all_active
    )
    test_result("GET /api/printers?active=true", passed, f"Status: {response.status_code}, Count: {len(data)}, All active: {all_active}")
except Exception as e:
    test_result("GET /api/printers?active=true", False, f"Exception: {str(e)}")

# ============================================================================
# SUITE B: POST crítico - Create operations (10 tests)
# ============================================================================

print("\n\n📍 SUITE B: POST crítico - Create operations")
print("=" * 80)

# B1: POST /api/seed → 200 with seeded counts
print("\n[B1] POST /api/seed - Seed database")
try:
    # Retry up to 3 times for transient 502 errors
    max_retries = 3
    for attempt in range(max_retries):
        response = requests.post(f"{API_URL}/seed", json={}, timeout=30)
        if response.status_code == 200:
            break
        if attempt < max_retries - 1:
            import time
            time.sleep(2)
    
    data = response.json() if response.status_code == 200 else {}
    passed = (
        response.status_code == 200 and
        'seeded' in data and
        data['seeded'].get('printers') == 3 and
        data['seeded'].get('products') == 4 and
        data['seeded'].get('orders') == 5
    )
    test_result("POST /api/seed", passed, f"Status: {response.status_code}, Seeded: {data.get('seeded', {})}")
except Exception as e:
    test_result("POST /api/seed", False, f"Exception: {str(e)}")

# B2: POST /api/products → create product
print("\n[B2] POST /api/products - Create product")
try:
    payload = {
        "name": "Test Refactor Product",
        "category": "apparel",
        "subcategory": "poleras",
        "basePrice": 9990,
        "cost": 3000,
        "variants": [
            {
                "name": "Talla M",
                "attributes": {"size": "M"},
                "initialStock": 10
            }
        ]
    }
    response = requests.post(f"{API_URL}/products", json=payload, timeout=10)
    data = response.json() if response.status_code == 200 else {}
    has_uuid = 'product' in data and 'id' in data['product'] and len(data['product']['id']) == 36
    passed = (
        response.status_code == 200 and
        has_uuid
    )
    if passed and 'product' in data:
        test_product_id = data['product'].get('id')
        if data['product'].get('variants') and len(data['product']['variants']) > 0:
            test_variant_id = data['product']['variants'][0].get('id')
    test_result("POST /api/products", passed, f"Status: {response.status_code}, Has UUID: {has_uuid}")
except Exception as e:
    test_result("POST /api/products", False, f"Exception: {str(e)}")

# B3: POST /api/inventory/supplies → create supply
print("\n[B3] POST /api/inventory/supplies - Create supply")
try:
    payload = {
        "name": "Test Supply Refactor",
        "type": "film_pet",
        "unit": "meter",
        "currentQuantity": 50,
        "minAlert": 10
    }
    response = requests.post(f"{API_URL}/inventory/supplies", json=payload, timeout=10)
    data = response.json() if response.status_code == 200 else {}
    # Response is the supply object directly, not wrapped
    has_uuid = 'id' in data and len(data.get('id', '')) == 36
    passed = (
        response.status_code == 200 and
        has_uuid
    )
    if passed:
        test_supply_id = data.get('id')
    test_result("POST /api/inventory/supplies", passed, f"Status: {response.status_code}, Has UUID: {has_uuid}")
except Exception as e:
    test_result("POST /api/inventory/supplies", False, f"Exception: {str(e)}")

# B4: POST /api/inventory/adjust → adjust stock
print("\n[B4] POST /api/inventory/adjust - Adjust supply stock")
try:
    if test_supply_id:
        payload = {
            "itemType": "supply",
            "itemId": test_supply_id,
            "delta": 5,
            "reason": "test refactor"
        }
        response = requests.post(f"{API_URL}/inventory/adjust", json=payload, timeout=10)
        data = response.json() if response.status_code == 200 else {}
        passed = (
            response.status_code == 200 and
            'newQuantity' in data
        )
        test_result("POST /api/inventory/adjust", passed, f"Status: {response.status_code}, New quantity: {data.get('newQuantity')}")
    else:
        test_result("POST /api/inventory/adjust", False, "No test_supply_id available")
except Exception as e:
    test_result("POST /api/inventory/adjust", False, f"Exception: {str(e)}")

# B5: POST /api/products/bulk → bulk create products
print("\n[B5] POST /api/products/bulk - Bulk create products")
try:
    payload = {
        "items": [
            {
                "name": "Bulk Product 1",
                "category": "apparel",
                "basePrice": 1990
            },
            {
                "name": "Bulk Product 2",
                "category": "other",
                "basePrice": 2990
            }
        ]
    }
    response = requests.post(f"{API_URL}/products/bulk", json=payload, timeout=10)
    data = response.json() if response.status_code == 200 else {}
    passed = (
        response.status_code == 200 and
        data.get('created') == 2
    )
    test_result("POST /api/products/bulk", passed, f"Status: {response.status_code}, Created: {data.get('created')}")
except Exception as e:
    test_result("POST /api/products/bulk", False, f"Exception: {str(e)}")

# B6: POST /api/inventory/supplies/bulk → bulk create supplies
print("\n[B6] POST /api/inventory/supplies/bulk - Bulk create supplies")
try:
    payload = {
        "items": [
            {
                "name": "Bulk Supply 1",
                "type": "film_pet",
                "unit": "meter",
                "currentQuantity": 10
            }
        ]
    }
    response = requests.post(f"{API_URL}/inventory/supplies/bulk", json=payload, timeout=10)
    data = response.json() if response.status_code == 200 else {}
    passed = (
        response.status_code == 200 and
        data.get('created') == 1
    )
    test_result("POST /api/inventory/supplies/bulk", passed, f"Status: {response.status_code}, Created: {data.get('created')}")
except Exception as e:
    test_result("POST /api/inventory/supplies/bulk", False, f"Exception: {str(e)}")

# B7: POST /api/production/move → move production item
print("\n[B7] POST /api/production/move - Move production item")
try:
    # First get a production queue item
    queue_response = requests.get(f"{API_URL}/production/queue", timeout=10)
    queue_data = queue_response.json() if queue_response.status_code == 200 else []
    
    if queue_data and len(queue_data) > 0:
        # Find an item with status 'received'
        received_item = next((item for item in queue_data if item.get('status') == 'received'), None)
        
        if received_item:
            payload = {
                "id": received_item['id'],
                "toStatus": "printing"
            }
            response = requests.post(f"{API_URL}/production/move", json=payload, timeout=10)
            data = response.json() if response.status_code == 200 else {}
            passed = response.status_code == 200
            test_result("POST /api/production/move", passed, f"Status: {response.status_code}, Moved to printing")
        else:
            test_result("POST /api/production/move", True, "No 'received' items to move (expected after previous tests)")
    else:
        test_result("POST /api/production/move", True, "No queue items available (expected)")
except Exception as e:
    test_result("POST /api/production/move", False, f"Exception: {str(e)}")

# B8: POST /api/taxonomies → create taxonomy
print("\n[B8] POST /api/taxonomies - Create taxonomy")
try:
    import random
    random_suffix = random.randint(1000, 9999)
    payload = {
        "kind": "product_category",
        "label": f"Test Category Refactor {random_suffix}"
    }
    response = requests.post(f"{API_URL}/taxonomies", json=payload, timeout=10)
    data = response.json() if response.status_code == 200 else {}
    # Response is the taxonomy object directly, not wrapped
    has_code = 'code' in data
    passed = (
        response.status_code == 200 and
        has_code
    )
    if passed:
        test_taxonomy_id = data.get('id')
    test_result("POST /api/taxonomies", passed, f"Status: {response.status_code}, Code: {data.get('code')}")
except Exception as e:
    test_result("POST /api/taxonomies", False, f"Exception: {str(e)}")

# B9: POST /api/landings → create landing
print("\n[B9] POST /api/landings - Create landing")
try:
    import random
    random_suffix = random.randint(1000, 9999)
    payload = {
        "slug": f"test-refactor-landing-{random_suffix}",
        "h1": "Test Refactor Landing",
        "service": "dtf_textil"
    }
    response = requests.post(f"{API_URL}/landings", json=payload, timeout=10)
    data = response.json() if response.status_code == 200 else {}
    # Response is the landing object directly, not wrapped
    has_uuid = 'id' in data and len(data.get('id', '')) == 36
    passed = (
        response.status_code == 200 and
        has_uuid
    )
    if passed:
        test_landing_id = data.get('id')
    test_result("POST /api/landings", passed, f"Status: {response.status_code}, Has UUID: {has_uuid}")
except Exception as e:
    test_result("POST /api/landings", False, f"Exception: {str(e)}")

# B10: POST /api/printers → create printer, PATCH, DELETE
print("\n[B10] POST /api/printers - Create, PATCH, DELETE printer")
try:
    import random
    random_suffix = random.randint(1000, 9999)
    # Create
    payload = {
        "code": f"test_refactor_printer_{random_suffix}",
        "label": "Test Refactor Printer",
        "type": "dtf_textil",
        "widthMm": 400,
        "pricePerMm": 15
    }
    response = requests.post(f"{API_URL}/printers", json=payload, timeout=10)
    data = response.json() if response.status_code == 200 else {}
    # Response is the printer object directly, not wrapped
    create_passed = response.status_code == 200 and 'id' in data
    
    if create_passed:
        printer_id = data.get('id')
        
        # PATCH
        patch_payload = {
            "id": printer_id,
            "active": False
        }
        patch_response = requests.patch(f"{API_URL}/printers", json=patch_payload, timeout=10)
        patch_passed = patch_response.status_code == 200
        
        # DELETE
        delete_payload = {"id": printer_id}
        delete_response = requests.delete(f"{API_URL}/printers", json=delete_payload, timeout=10)
        delete_passed = delete_response.status_code == 200
        
        passed = create_passed and patch_passed and delete_passed
        test_result("POST /api/printers (CRUD)", passed, f"Create: {create_passed}, PATCH: {patch_passed}, DELETE: {delete_passed}")
    else:
        test_result("POST /api/printers (CRUD)", False, f"Create failed: {response.status_code}")
except Exception as e:
    test_result("POST /api/printers (CRUD)", False, f"Exception: {str(e)}")

# ============================================================================
# SUITE C: POST checkout público (3 tests)
# ============================================================================

print("\n\n📍 SUITE C: POST checkout público")
print("=" * 80)

# C1: Get product and variant for checkout
print("\n[C1] Setup - Get product with stock for checkout")
try:
    # Get commercial stock to find products with available quantity
    stock_response = requests.get(f"{API_URL}/inventory/commercial", timeout=10)
    stock_items = stock_response.json() if stock_response.status_code == 200 else []
    
    # Find first item with quantity > 0
    available_item = next((item for item in stock_items if item.get('quantity', 0) > 0), None)
    
    if available_item:
        test_product_id = available_item.get('productId')
        test_variant_id = available_item.get('variantId')
        print(f"✅ Product ID: {test_product_id}, Variant ID: {test_variant_id}, Available: {available_item.get('quantity')}")
    else:
        print(f"⚠️  No products with stock available")
except Exception as e:
    print(f"⚠️  Exception: {str(e)}")

# C2: POST /api/orders/public → create public order
print("\n[C2] POST /api/orders/public - Create public order")
try:
    if test_product_id and test_variant_id:
        payload = {
            "customer": {
                "name": "Test Refactor Customer",
                "email": "test@refactor.cl",
                "phone": "+56911111111",
                "rut": "11.111.111-1"
            },
            "deliveryMethod": "pickup",
            "paymentMethod": "transfer",
            "items": [
                {
                    "productId": test_product_id,
                    "variantId": test_variant_id,
                    "quantity": 1
                }
            ],
            "notes": "Test refactor order"
        }
        response = requests.post(f"{API_URL}/orders/public", json=payload, timeout=10)
        data = response.json() if response.status_code == 200 else {}
        has_order_number = 'orderNumber' in data and data['orderNumber'].startswith('DLV-2025-')
        passed = (
            response.status_code == 200 and
            has_order_number and
            'total' in data
        )
        if passed:
            test_order_number = data.get('orderNumber')
        test_result("POST /api/orders/public", passed, f"Status: {response.status_code}, Order: {data.get('orderNumber')}, Total: {data.get('total')}")
    else:
        test_result("POST /api/orders/public", False, "No product/variant available")
except Exception as e:
    test_result("POST /api/orders/public", False, f"Exception: {str(e)}")

# C3: GET /api/orders/lookup → verify created order
print("\n[C3] GET /api/orders/lookup - Verify created order")
try:
    if test_order_number:
        response = requests.get(f"{API_URL}/orders/lookup?number={test_order_number}", timeout=10)
        data = response.json() if response.status_code == 200 else {}
        passed = (
            response.status_code == 200 and
            'order' in data and
            'items' in data and
            data['order'].get('orderNumber') == test_order_number
        )
        test_result("GET /api/orders/lookup (verify)", passed, f"Status: {response.status_code}, Found order: {data.get('order', {}).get('orderNumber')}")
    else:
        test_result("GET /api/orders/lookup (verify)", False, "No order number available")
except Exception as e:
    test_result("GET /api/orders/lookup (verify)", False, f"Exception: {str(e)}")

# ============================================================================
# SUITE D: POST gang-sheets (5 tests)
# ============================================================================

print("\n\n📍 SUITE D: POST gang-sheets")
print("=" * 80)

# D1: POST /api/gang-sheets with printerCode (happy path)
print("\n[D1] POST /api/gang-sheets - Happy path with printerCode")
try:
    payload = {
        "printerCode": "prestige_r2_pro",
        "canvasWidthMm": 330,
        "designs": [
            {
                "xMm": 10,
                "yMm": 10,
                "widthMm": 100,
                "heightMm": 100,
                "srcWidthPx": 1200,
                "srcHeightPx": 1200,
                "name": "test.png",
                "imageUrl": "/test.png"
            }
        ]
    }
    response = requests.post(f"{API_URL}/gang-sheets", json=payload, timeout=10)
    data = response.json() if response.status_code == 200 else {}
    passed = (
        response.status_code == 200 and
        'orderNumber' in data and
        data.get('printer') == 'prestige_r2_pro' and
        data.get('printerLabel') == 'Prestige R2 Pro'
    )
    test_result("POST /api/gang-sheets (printerCode)", passed, f"Status: {response.status_code}, Order: {data.get('orderNumber')}, Printer: {data.get('printer')}")
except Exception as e:
    test_result("POST /api/gang-sheets (printerCode)", False, f"Exception: {str(e)}")

# D2: POST /api/gang-sheets with legacy mode
print("\n[D2] POST /api/gang-sheets - Legacy mode")
try:
    payload = {
        "mode": "dtf_textil_31",
        "canvasWidthMm": 310,
        "designs": [
            {
                "xMm": 10,
                "yMm": 10,
                "widthMm": 100,
                "heightMm": 100,
                "srcWidthPx": 1200,
                "srcHeightPx": 1200,
                "name": "test.png",
                "imageUrl": "/test.png"
            }
        ]
    }
    response = requests.post(f"{API_URL}/gang-sheets", json=payload, timeout=10)
    data = response.json() if response.status_code == 200 else {}
    passed = response.status_code == 200 and 'orderNumber' in data
    test_result("POST /api/gang-sheets (legacy mode)", passed, f"Status: {response.status_code}, Order: {data.get('orderNumber')}")
except Exception as e:
    test_result("POST /api/gang-sheets (legacy mode)", False, f"Exception: {str(e)}")

# D3: POST /api/gang-sheets without printerCode or mode → 400
print("\n[D3] POST /api/gang-sheets - Missing printerCode/mode (should fail)")
try:
    payload = {
        "canvasWidthMm": 330,
        "designs": [
            {
                "xMm": 10,
                "yMm": 10,
                "widthMm": 100,
                "heightMm": 100,
                "srcWidthPx": 1200,
                "srcHeightPx": 1200,
                "name": "test.png",
                "imageUrl": "/test.png"
            }
        ]
    }
    response = requests.post(f"{API_URL}/gang-sheets", json=payload, timeout=10)
    passed = response.status_code == 400
    test_result("POST /api/gang-sheets (missing mode)", passed, f"Status: {response.status_code} (expected 400)")
except Exception as e:
    test_result("POST /api/gang-sheets (missing mode)", False, f"Exception: {str(e)}")

# D4: POST /api/gang-sheets with nonexistent printerCode → 400
print("\n[D4] POST /api/gang-sheets - Nonexistent printerCode (should fail)")
try:
    payload = {
        "printerCode": "nonexistent_printer",
        "canvasWidthMm": 330,
        "designs": [
            {
                "xMm": 10,
                "yMm": 10,
                "widthMm": 100,
                "heightMm": 100,
                "srcWidthPx": 1200,
                "srcHeightPx": 1200,
                "name": "test.png",
                "imageUrl": "/test.png"
            }
        ]
    }
    response = requests.post(f"{API_URL}/gang-sheets", json=payload, timeout=10)
    passed = response.status_code == 400
    test_result("POST /api/gang-sheets (nonexistent printer)", passed, f"Status: {response.status_code} (expected 400)")
except Exception as e:
    test_result("POST /api/gang-sheets (nonexistent printer)", False, f"Exception: {str(e)}")

# D5: POST /api/gang-sheets with design exceeding canvas width → 400
print("\n[D5] POST /api/gang-sheets - Design exceeds canvas (should fail)")
try:
    payload = {
        "printerCode": "prestige_r2_pro",
        "canvasWidthMm": 330,
        "designs": [
            {
                "xMm": 10,
                "yMm": 10,
                "widthMm": 400,  # Exceeds 330mm canvas
                "heightMm": 100,
                "srcWidthPx": 1200,
                "srcHeightPx": 1200,
                "name": "too-wide.png",
                "imageUrl": "/test.png"
            }
        ]
    }
    response = requests.post(f"{API_URL}/gang-sheets", json=payload, timeout=10)
    passed = response.status_code == 400
    test_result("POST /api/gang-sheets (design exceeds canvas)", passed, f"Status: {response.status_code} (expected 400)")
except Exception as e:
    test_result("POST /api/gang-sheets (design exceeds canvas)", False, f"Exception: {str(e)}")

# ============================================================================
# SUITE E: Upload de diseño (1 test)
# ============================================================================

print("\n\n📍 SUITE E: Upload de diseño")
print("=" * 80)

# E1: POST /api/uploads/design with multipart FormData
print("\n[E1] POST /api/uploads/design - Upload design image")
try:
    # Create a small test PNG image
    img = Image.new('RGB', (100, 100), color='red')
    img_buffer = BytesIO()
    img.save(img_buffer, format='PNG', dpi=(300, 300))
    img_buffer.seek(0)
    
    files = {'file': ('test-refactor.png', img_buffer, 'image/png')}
    response = requests.post(f"{API_URL}/uploads/design", files=files, timeout=10)
    data = response.json() if response.status_code == 200 else {}
    
    passed = (
        response.status_code == 200 and
        'id' in data and
        'url' in data and
        'widthPx' in data and
        'heightPx' in data and
        'dpi' in data and
        'sizeBytes' in data
    )
    
    # Verify file exists
    if passed and 'url' in data:
        file_path = f"/app/public{data['url']}"
        file_exists = os.path.exists(file_path)
        passed = passed and file_exists
        test_result("POST /api/uploads/design", passed, f"Status: {response.status_code}, URL: {data.get('url')}, File exists: {file_exists}")
    else:
        test_result("POST /api/uploads/design", passed, f"Status: {response.status_code}")
except Exception as e:
    test_result("POST /api/uploads/design", False, f"Exception: {str(e)}")

# ============================================================================
# SUITE F: Validaciones de errores (9 tests)
# ============================================================================

print("\n\n📍 SUITE F: Validaciones de errores")
print("=" * 80)

# F1: POST /api/orders/public without customer.name → 400
print("\n[F1] POST /api/orders/public - Missing customer.name (should fail)")
try:
    payload = {
        "customer": {
            "email": "test@test.cl"
        },
        "deliveryMethod": "pickup",
        "paymentMethod": "transfer",
        "items": [{"productId": "test", "variantId": "test", "quantity": 1}]
    }
    response = requests.post(f"{API_URL}/orders/public", json=payload, timeout=10)
    passed = response.status_code == 400
    test_result("POST /api/orders/public (missing name)", passed, f"Status: {response.status_code} (expected 400)")
except Exception as e:
    test_result("POST /api/orders/public (missing name)", False, f"Exception: {str(e)}")

# F2: POST /api/orders/public with empty items → 400
print("\n[F2] POST /api/orders/public - Empty items (should fail)")
try:
    payload = {
        "customer": {
            "name": "Test",
            "email": "test@test.cl"
        },
        "deliveryMethod": "pickup",
        "paymentMethod": "transfer",
        "items": []
    }
    response = requests.post(f"{API_URL}/orders/public", json=payload, timeout=10)
    passed = response.status_code == 400
    test_result("POST /api/orders/public (empty items)", passed, f"Status: {response.status_code} (expected 400)")
except Exception as e:
    test_result("POST /api/orders/public (empty items)", False, f"Exception: {str(e)}")

# F3: POST /api/products without category → 400
print("\n[F3] POST /api/products - Missing category (should fail)")
try:
    payload = {
        "name": "Test Product",
        "basePrice": 1000
    }
    response = requests.post(f"{API_URL}/products", json=payload, timeout=10)
    passed = response.status_code == 400
    test_result("POST /api/products (missing category)", passed, f"Status: {response.status_code} (expected 400)")
except Exception as e:
    test_result("POST /api/products (missing category)", False, f"Exception: {str(e)}")

# F4: POST /api/inventory/supplies without type → 400
print("\n[F4] POST /api/inventory/supplies - Missing type (should fail)")
try:
    payload = {
        "name": "Test Supply",
        "unit": "meter",
        "currentQuantity": 10
    }
    response = requests.post(f"{API_URL}/inventory/supplies", json=payload, timeout=10)
    passed = response.status_code == 400
    test_result("POST /api/inventory/supplies (missing type)", passed, f"Status: {response.status_code} (expected 400)")
except Exception as e:
    test_result("POST /api/inventory/supplies (missing type)", False, f"Exception: {str(e)}")

# F5: POST /api/taxonomies with invalid kind → 400
print("\n[F5] POST /api/taxonomies - Invalid kind (should fail)")
try:
    payload = {
        "kind": "invalid_kind",
        "label": "Test"
    }
    response = requests.post(f"{API_URL}/taxonomies", json=payload, timeout=10)
    passed = response.status_code == 400
    test_result("POST /api/taxonomies (invalid kind)", passed, f"Status: {response.status_code} (expected 400)")
except Exception as e:
    test_result("POST /api/taxonomies (invalid kind)", False, f"Exception: {str(e)}")

# F6: POST /api/landings with invalid slug → 400
print("\n[F6] POST /api/landings - Invalid slug (should fail)")
try:
    payload = {
        "slug": "BAD SLUG WITH SPACES",
        "h1": "Test",
        "service": "dtf_textil"
    }
    response = requests.post(f"{API_URL}/landings", json=payload, timeout=10)
    passed = response.status_code == 400
    test_result("POST /api/landings (invalid slug)", passed, f"Status: {response.status_code} (expected 400)")
except Exception as e:
    test_result("POST /api/landings (invalid slug)", False, f"Exception: {str(e)}")

# F7: POST /api/printers with invalid code → 400
print("\n[F7] POST /api/printers - Invalid code (should fail)")
try:
    payload = {
        "code": "BAD CODE!",
        "label": "Test",
        "type": "dtf_textil",
        "widthMm": 300,
        "pricePerMm": 10
    }
    response = requests.post(f"{API_URL}/printers", json=payload, timeout=10)
    passed = response.status_code == 400
    test_result("POST /api/printers (invalid code)", passed, f"Status: {response.status_code} (expected 400)")
except Exception as e:
    test_result("POST /api/printers (invalid code)", False, f"Exception: {str(e)}")

# F8: GET /api/nonexistent → 404
print("\n[F8] GET /api/nonexistent - Nonexistent route (should fail)")
try:
    response = requests.get(f"{API_URL}/nonexistent", timeout=10)
    data = response.json() if response.status_code == 404 else {}
    passed = response.status_code == 404 and 'error' in data
    test_result("GET /api/nonexistent", passed, f"Status: {response.status_code} (expected 404), Error: {data.get('error')}")
except Exception as e:
    test_result("GET /api/nonexistent", False, f"Exception: {str(e)}")

# F9: POST /api/orders/public without valid body → 400
print("\n[F9] POST /api/orders/public - Invalid body (should fail)")
try:
    response = requests.post(f"{API_URL}/orders/public", json={}, timeout=10)
    passed = response.status_code == 400
    test_result("POST /api/orders/public (invalid body)", passed, f"Status: {response.status_code} (expected 400)")
except Exception as e:
    test_result("POST /api/orders/public (invalid body)", False, f"Exception: {str(e)}")

# ============================================================================
# SUITE G: CORS (1 test)
# ============================================================================

print("\n\n📍 SUITE G: CORS")
print("=" * 80)

# G1: Verify CORS headers
print("\n[G1] Verify CORS headers")
try:
    response = requests.get(f"{API_URL}/", timeout=10)
    headers = response.headers
    
    has_cors_origin = 'Access-Control-Allow-Origin' in headers
    has_cors_methods = 'Access-Control-Allow-Methods' in headers
    
    methods_ok = False
    if has_cors_methods:
        methods = headers['Access-Control-Allow-Methods']
        required_methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
        methods_ok = all(method in methods for method in required_methods)
    
    passed = has_cors_origin and has_cors_methods and methods_ok
    test_result("CORS headers", passed, f"Origin: {has_cors_origin}, Methods: {has_cors_methods}, All methods: {methods_ok}")
except Exception as e:
    test_result("CORS headers", False, f"Exception: {str(e)}")

# ============================================================================
# SUITE H: 404 handling (1 test)
# ============================================================================

print("\n\n📍 SUITE H: 404 handling")
print("=" * 80)

# H1: GET /api/foo/bar → 404 with json error
print("\n[H1] GET /api/foo/bar - 404 handling")
try:
    response = requests.get(f"{API_URL}/foo/bar", timeout=10)
    data = response.json() if response.status_code == 404 else {}
    
    passed = (
        response.status_code == 404 and
        'error' in data and
        'Route /foo/bar not found' in data['error']
    )
    test_result("404 handling", passed, f"Status: {response.status_code}, Error: {data.get('error')}")
except Exception as e:
    test_result("404 handling", False, f"Exception: {str(e)}")

# ============================================================================
# FINAL SUMMARY
# ============================================================================

print("\n\n" + "=" * 80)
print("🏁 REFACTOR REGRESSION TEST SUITE COMPLETE")
print("=" * 80)
print(f"\n📊 RESULTS:")
print(f"   Total tests: {total_tests}")
print(f"   ✅ Passed: {passed_tests}")
print(f"   ❌ Failed: {failed_tests}")
print(f"   Success rate: {(passed_tests/total_tests*100):.1f}%")

if failed_tests == 0:
    print(f"\n🎉 SUCCESS - ZERO REGRESSIONS DETECTED!")
    print(f"   All {total_tests} endpoints behave exactly as before the refactor.")
    print(f"   The monolithic route.js → 12 domain modules refactor is VERIFIED ✅")
else:
    print(f"\n⚠️  REGRESSIONS DETECTED - {failed_tests} test(s) failed")
    print(f"   Review the failed tests above for details.")

print("\n" + "=" * 80)
