#!/usr/bin/env python3
"""
Backend Testing Suite for Estampados DLV - Iteration 4
Tests new /api/printers CRUD + extended /api/gang-sheets with printerCode + extended /api/seed + regression
"""

import requests
import json
import os
from io import BytesIO
from PIL import Image

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://dtf-print-hub-2.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

print(f"🧪 Testing backend at: {API_URL}\n")
print("=" * 80)
print("ITERATION 4 - PRINTERS CRUD + DYNAMIC GANG SHEETS")
print("=" * 80)

# Global variables to store created IDs
test_printer_id = None
test_printer_code = None
printer_with_queue_id = None

# ============================================================================
# SECTION A: PRIORITY — /api/printers CRUD (NEW)
# ============================================================================

print("\n📍 SECTION A: /api/printers CRUD (NEW - ITERATION 4)")
print("=" * 80)

# A1: POST /api/seed → 200 with seeded.printers === 3
print("\n[A1] POST /api/seed - Verify 3 printers seeded")
try:
    response = requests.post(f"{API_URL}/seed", timeout=15)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        printers_count = data.get('seeded', {}).get('printers', 0)
        
        if printers_count == 3:
            print(f"✅ PASS - Seeded exactly 3 printers (epson_r1390, prestige_r2_pro, dtf_uv)")
        else:
            print(f"❌ FAIL - Expected 3 printers, got {printers_count}")
        
        print(f"   Full seed counts: {data.get('seeded')}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A2: GET /api/printers → array with at least 3 elements, ordered by sortOrder, no _id
print("\n[A2] GET /api/printers - List all printers")
try:
    response = requests.get(f"{API_URL}/printers", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Received {len(data)} printers")
        
        if len(data) >= 3:
            print(f"✅ PASS - At least 3 printers exist")
        else:
            print(f"❌ FAIL - Expected at least 3 printers, got {len(data)}")
        
        # Verify no _id
        has_mongo_id = any('_id' in item for item in data)
        if has_mongo_id:
            print(f"❌ FAIL - Response contains MongoDB _id field")
        else:
            print(f"✅ PASS - No MongoDB _id in response")
        
        # Verify required fields
        if data:
            first = data[0]
            required_fields = ['id', 'code', 'label', 'shortLabel', 'type', 'widthMm', 'dpi', 
                             'supportsWhite', 'supportsVarnish', 'pricePerMm', 'minLengthMm', 
                             'dailyCapacityM', 'color', 'notes', 'active', 'sortOrder', 
                             'createdAt', 'updatedAt']
            missing = [f for f in required_fields if f not in first]
            
            if not missing:
                print(f"✅ PASS - All required fields present")
                print(f"   Sample: {first['code']} - {first['label']} ({first['widthMm']}mm)")
            else:
                print(f"❌ FAIL - Missing fields: {missing}")
        
        # Verify ordering by sortOrder
        sort_orders = [p.get('sortOrder', 999) for p in data]
        if sort_orders == sorted(sort_orders):
            print(f"✅ PASS - Printers ordered by sortOrder")
        else:
            print(f"⚠️  WARNING - Printers not ordered by sortOrder: {sort_orders}")
        
        # Store printer with queue for later DELETE test
        for p in data:
            if p.get('code') == 'epson_r1390':
                printer_with_queue_id = p.get('id')
                print(f"   Stored epson_r1390 id for DELETE test: {printer_with_queue_id}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A3: GET /api/printers?active=true → only active
print("\n[A3] GET /api/printers?active=true - Filter active only")
try:
    response = requests.get(f"{API_URL}/printers?active=true", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Received {len(data)} active printers")
        
        all_active = all(p.get('active') == True for p in data)
        if all_active:
            print(f"✅ PASS - All returned printers are active")
        else:
            print(f"❌ FAIL - Some printers are not active")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A4: POST /api/printers happy path
print("\n[A4] POST /api/printers - Create new printer (happy path)")
try:
    payload = {
        "code": "test_epson_a3",
        "label": "Epson A3 Test",
        "shortLabel": "A3",
        "type": "dtf_textil",
        "widthMm": 400,
        "dpi": 300,
        "pricePerMm": 15,
        "minLengthMm": 100,
        "dailyCapacityM": 50,
        "supportsWhite": True,
        "color": "from-cyan-500 to-blue-600",
        "notes": "Test agregado por QA",
        "sortOrder": 10,
        "active": True
    }
    
    response = requests.post(f"{API_URL}/printers", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Printer created successfully")
        
        # Verify UUID id
        if 'id' in data and len(data['id']) == 36:
            print(f"✅ PASS - UUID id present: {data['id']}")
            test_printer_id = data['id']
            test_printer_code = data.get('code')
        else:
            print(f"❌ FAIL - Invalid or missing id")
        
        # Verify all fields preserved
        fields_match = all(data.get(k) == v for k, v in payload.items())
        if fields_match:
            print(f"✅ PASS - All fields preserved correctly")
        else:
            print(f"⚠️  WARNING - Some fields may not match")
        
        # Verify no _id
        if '_id' not in data:
            print(f"✅ PASS - No MongoDB _id in response")
        else:
            print(f"❌ FAIL - MongoDB _id present")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A5: POST /api/printers validations
print("\n[A5] POST /api/printers - Validation tests")

# A5.1: Duplicate code → 409
print("\n[A5.1] Duplicate code → 409")
try:
    payload = {
        "code": "test_epson_a3",  # Duplicate from A4
        "label": "Another printer",
        "type": "dtf_textil",
        "widthMm": 300,
        "pricePerMm": 10
    }
    
    response = requests.post(f"{API_URL}/printers", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 409:
        print(f"✅ PASS - Duplicate code correctly rejected with 409")
        print(f"   Error: {response.json().get('error')}")
    else:
        print(f"❌ FAIL - Expected 409, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A5.2: Invalid code format → 400
print("\n[A5.2] Invalid code format → 400")
try:
    payload = {
        "code": "BAD CODE!",  # Invalid: spaces and special chars
        "label": "x",
        "type": "dtf_textil",
        "widthMm": 300,
        "pricePerMm": 10
    }
    
    response = requests.post(f"{API_URL}/printers", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        print(f"✅ PASS - Invalid code format correctly rejected with 400")
        print(f"   Error: {response.json().get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A5.3: Missing label → 400
print("\n[A5.3] Missing label → 400")
try:
    payload = {
        "code": "no_label",
        "type": "dtf_textil",
        "widthMm": 300,
        "pricePerMm": 10
    }
    
    response = requests.post(f"{API_URL}/printers", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        print(f"✅ PASS - Missing label correctly rejected with 400")
        print(f"   Error: {response.json().get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A5.4: widthMm too small (10) → 400
print("\n[A5.4] widthMm too small (10) → 400")
try:
    payload = {
        "code": "width_bad",
        "label": "x",
        "widthMm": 10,  # Below 50
        "pricePerMm": 10
    }
    
    response = requests.post(f"{API_URL}/printers", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        print(f"✅ PASS - widthMm too small correctly rejected with 400")
        print(f"   Error: {response.json().get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A5.5: widthMm too large (5000) → 400
print("\n[A5.5] widthMm too large (5000) → 400")
try:
    payload = {
        "code": "width_bad2",
        "label": "x",
        "widthMm": 5000,  # Above 2000
        "pricePerMm": 10
    }
    
    response = requests.post(f"{API_URL}/printers", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        print(f"✅ PASS - widthMm too large correctly rejected with 400")
        print(f"   Error: {response.json().get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A5.6: pricePerMm invalid (0) → 400
print("\n[A5.6] pricePerMm invalid (0) → 400")
try:
    payload = {
        "code": "price_bad",
        "label": "x",
        "widthMm": 300,
        "pricePerMm": 0  # Must be > 0
    }
    
    response = requests.post(f"{API_URL}/printers", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        print(f"✅ PASS - pricePerMm=0 correctly rejected with 400")
        print(f"   Error: {response.json().get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A6: PATCH /api/printers - Update widthMm and color
print("\n[A6] PATCH /api/printers - Update widthMm and color")
try:
    if test_printer_id:
        payload = {
            "id": test_printer_id,
            "widthMm": 450,
            "color": "from-pink-500 to-rose-600"
        }
        
        response = requests.patch(f"{API_URL}/printers", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ PASS - Printer updated successfully")
            
            if data.get('widthMm') == 450:
                print(f"✅ PASS - widthMm updated to 450")
            else:
                print(f"❌ FAIL - widthMm not updated correctly: {data.get('widthMm')}")
            
            if data.get('color') == "from-pink-500 to-rose-600":
                print(f"✅ PASS - color updated correctly")
            else:
                print(f"❌ FAIL - color not updated correctly: {data.get('color')}")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
    else:
        print(f"⚠️  SKIP - No test printer ID from A4")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A7: PATCH /api/printers - Change type to dtf_uv and verify supportsVarnish
print("\n[A7] PATCH /api/printers - Change type to dtf_uv")
try:
    if test_printer_id:
        # Change to dtf_uv with supportsVarnish
        payload = {
            "id": test_printer_id,
            "type": "dtf_uv",
            "supportsVarnish": True
        }
        
        response = requests.patch(f"{API_URL}/printers", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ PASS - Type changed to dtf_uv")
            
            if data.get('type') == 'dtf_uv' and data.get('supportsVarnish') == True:
                print(f"✅ PASS - type=dtf_uv and supportsVarnish=true")
            else:
                print(f"❌ FAIL - Fields not updated correctly")
        
        # Change back to dtf_textil - should reset supportsVarnish to false
        payload2 = {
            "id": test_printer_id,
            "type": "dtf_textil"
        }
        
        response2 = requests.patch(f"{API_URL}/printers", json=payload2, timeout=10)
        print(f"Change back status: {response2.status_code}")
        
        if response2.status_code == 200:
            data2 = response2.json()
            if data2.get('type') == 'dtf_textil' and data2.get('supportsVarnish') == False:
                print(f"✅ PASS - Changed back to dtf_textil, supportsVarnish auto-reset to false")
            else:
                print(f"❌ FAIL - supportsVarnish not reset: {data2.get('supportsVarnish')}")
    else:
        print(f"⚠️  SKIP - No test printer ID from A4")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A8: PATCH /api/printers - Change code validations
print("\n[A8] PATCH /api/printers - Change code validations")

# A8.1: Valid code change
print("\n[A8.1] Valid code change → 200")
try:
    if test_printer_id:
        payload = {
            "id": test_printer_id,
            "code": "renamed_test"
        }
        
        response = requests.patch(f"{API_URL}/printers", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('code') == 'renamed_test':
                print(f"✅ PASS - Code updated to 'renamed_test'")
                test_printer_code = 'renamed_test'
            else:
                print(f"❌ FAIL - Code not updated: {data.get('code')}")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
    else:
        print(f"⚠️  SKIP - No test printer ID from A4")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A8.2: Invalid code format → 400
print("\n[A8.2] Invalid code format → 400")
try:
    if test_printer_id:
        payload = {
            "id": test_printer_id,
            "code": "BAD!!"
        }
        
        response = requests.patch(f"{API_URL}/printers", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 400:
            print(f"✅ PASS - Invalid code format rejected with 400")
            print(f"   Error: {response.json().get('error')}")
        else:
            print(f"❌ FAIL - Expected 400, got {response.status_code}")
    else:
        print(f"⚠️  SKIP - No test printer ID from A4")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A8.3: Duplicate code → 409
print("\n[A8.3] Duplicate code (epson_r1390) → 409")
try:
    if test_printer_id:
        payload = {
            "id": test_printer_id,
            "code": "epson_r1390"  # Already exists
        }
        
        response = requests.patch(f"{API_URL}/printers", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 409:
            print(f"✅ PASS - Duplicate code rejected with 409")
            print(f"   Error: {response.json().get('error')}")
        else:
            print(f"❌ FAIL - Expected 409, got {response.status_code}")
    else:
        print(f"⚠️  SKIP - No test printer ID from A4")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A9: DELETE /api/printers
print("\n[A9] DELETE /api/printers - Delete tests")

# A9.1: Delete test printer (no items in queue) → 200
print("\n[A9.1] Delete test printer (no items in queue) → 200")
try:
    if test_printer_id:
        payload = {"id": test_printer_id}
        
        response = requests.delete(f"{API_URL}/printers", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok') == True:
                print(f"✅ PASS - Printer deleted successfully")
            else:
                print(f"❌ FAIL - Expected {{ok: true}}, got: {data}")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
        
        # Verify it's gone
        verify_response = requests.get(f"{API_URL}/printers", timeout=10)
        if verify_response.status_code == 200:
            printers = verify_response.json()
            deleted_still_exists = any(p.get('id') == test_printer_id for p in printers)
            if not deleted_still_exists:
                print(f"✅ PASS - Printer no longer in GET /api/printers")
            else:
                print(f"❌ FAIL - Deleted printer still appears in list")
    else:
        print(f"⚠️  SKIP - No test printer ID from A4")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A9.2: Second DELETE same id → 404
print("\n[A9.2] Second DELETE same id → 404")
try:
    if test_printer_id:
        payload = {"id": test_printer_id}
        
        response = requests.delete(f"{API_URL}/printers", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 404:
            print(f"✅ PASS - Second delete correctly returns 404")
        else:
            print(f"❌ FAIL - Expected 404, got {response.status_code}")
    else:
        print(f"⚠️  SKIP - No test printer ID from A4")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A9.3: Delete printer with items in queue → 409
print("\n[A9.3] Delete printer with items in queue → 409")
try:
    if printer_with_queue_id:
        payload = {"id": printer_with_queue_id}
        
        response = requests.delete(f"{API_URL}/printers", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 409:
            print(f"✅ PASS - Printer with queue items correctly rejected with 409")
            data = response.json()
            error_msg = data.get('error', '')
            print(f"   Error: {error_msg}")
            
            # Verify error message mentions queue count
            if 'trabajo' in error_msg or 'cola' in error_msg:
                print(f"✅ PASS - Error message mentions queue/trabajos")
            else:
                print(f"⚠️  WARNING - Error message doesn't mention queue")
        else:
            print(f"❌ FAIL - Expected 409, got {response.status_code}")
            print(f"   Response: {response.text}")
    else:
        print(f"⚠️  SKIP - No printer with queue ID found")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# ============================================================================
# SECTION B: /api/config extended
# ============================================================================

print("\n\n📍 SECTION B: /api/config EXTENDED")
print("=" * 80)

# B1: GET /api/config → must contain printers (legacy), printersDynamic (array), enums
print("\n[B1] GET /api/config - Verify printersDynamic array")
try:
    response = requests.get(f"{API_URL}/config", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Config retrieved")
        
        # Check legacy printers
        if 'printers' in data and isinstance(data['printers'], dict):
            print(f"✅ PASS - Legacy 'printers' object present (3 keys)")
            print(f"   Keys: {list(data['printers'].keys())}")
        else:
            print(f"❌ FAIL - Missing or invalid 'printers' field")
        
        # Check printersDynamic
        if 'printersDynamic' in data and isinstance(data['printersDynamic'], list):
            print(f"✅ PASS - 'printersDynamic' array present")
            print(f"   Count: {len(data['printersDynamic'])} printers")
            
            if len(data['printersDynamic']) >= 3:
                print(f"✅ PASS - At least 3 printers in printersDynamic")
            else:
                print(f"❌ FAIL - Expected at least 3 printers in printersDynamic")
            
            # Verify structure
            if data['printersDynamic']:
                sample = data['printersDynamic'][0]
                print(f"   Sample: {sample.get('code')} - {sample.get('label')}")
        else:
            print(f"❌ FAIL - Missing or invalid 'printersDynamic' field")
        
        # Check enums
        if 'enums' in data and isinstance(data['enums'], dict):
            print(f"✅ PASS - 'enums' object present")
        else:
            print(f"❌ FAIL - Missing 'enums' field")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# ============================================================================
# SECTION C: /api/gang-sheets — soporte de printerCode dinámico
# ============================================================================

print("\n\n📍 SECTION C: /api/gang-sheets WITH DYNAMIC printerCode")
print("=" * 80)

# C1: Happy path with printerCode canónico
print("\n[C1] POST /api/gang-sheets - Happy path with printerCode='prestige_r2_pro'")
try:
    payload = {
        "printerCode": "prestige_r2_pro",
        "canvasWidthMm": 330,
        "express": False,
        "designs": [
            {
                "xMm": 10,
                "yMm": 10,
                "widthMm": 100,
                "heightMm": 150,
                "srcWidthPx": 1200,
                "srcHeightPx": 1800,
                "name": "test.png",
                "imageUrl": "/uploads/designs/test.png"
            }
        ]
    }
    
    response = requests.post(f"{API_URL}/gang-sheets", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Gang sheet created with printerCode")
        
        # Verify orderNumber format
        order_num = data.get('orderNumber', '')
        if order_num.startswith('DLV-2025-'):
            print(f"✅ PASS - Order number format correct: {order_num}")
        else:
            print(f"❌ FAIL - Order number format incorrect: {order_num}")
        
        # Verify printer
        if data.get('printer') == 'prestige_r2_pro':
            print(f"✅ PASS - printer='prestige_r2_pro'")
        else:
            print(f"❌ FAIL - printer field incorrect: {data.get('printer')}")
        
        # Verify printerLabel
        if 'Prestige R2 Pro' in data.get('printerLabel', ''):
            print(f"✅ PASS - printerLabel contains 'Prestige R2 Pro'")
        else:
            print(f"⚠️  WARNING - printerLabel: {data.get('printerLabel')}")
        
        # Verify total > 0
        if data.get('total', 0) > 0:
            print(f"✅ PASS - total > 0: ${data.get('total')}")
        else:
            print(f"❌ FAIL - total is 0 or missing")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# C2: Happy path with legacy mode (backward compatibility)
print("\n[C2] POST /api/gang-sheets - Legacy mode='dtf_textil_31' (backward compat)")
try:
    payload = {
        "mode": "dtf_textil_31",
        "canvasWidthMm": 310,
        "express": False,
        "designs": [
            {
                "xMm": 10,
                "yMm": 10,
                "widthMm": 100,
                "heightMm": 150,
                "srcWidthPx": 1200,
                "srcHeightPx": 1800,
                "name": "test2.png",
                "imageUrl": "/uploads/designs/test2.png"
            }
        ]
    }
    
    response = requests.post(f"{API_URL}/gang-sheets", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Legacy mode still works")
        print(f"   Order: {data.get('orderNumber')}, Total: ${data.get('total')}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# C3: printerCode inexistente → 400
print("\n[C3] POST /api/gang-sheets - printerCode inexistente → 400")
try:
    payload = {
        "printerCode": "no_existe",
        "canvasWidthMm": 300,
        "designs": [
            {
                "xMm": 10,
                "yMm": 10,
                "widthMm": 100,
                "heightMm": 100,
                "srcWidthPx": 1200,
                "srcHeightPx": 1200,
                "name": "test.png",
                "imageUrl": "/uploads/designs/test.png"
            }
        ]
    }
    
    response = requests.post(f"{API_URL}/gang-sheets", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        print(f"✅ PASS - Non-existent printerCode rejected with 400")
        error_msg = response.json().get('error', '')
        print(f"   Error: {error_msg}")
        
        if 'no encontrado' in error_msg or 'inactivo' in error_msg:
            print(f"✅ PASS - Error message mentions 'no encontrado' or 'inactivo'")
        else:
            print(f"⚠️  WARNING - Error message doesn't mention expected text")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# C4: printerCode con equipo inactivo → 400
print("\n[C4] POST /api/gang-sheets - printerCode with inactive printer → 400")
try:
    # First create an inactive printer
    create_payload = {
        "code": "test_inactive",
        "label": "Test Inactive",
        "type": "dtf_textil",
        "widthMm": 300,
        "pricePerMm": 10,
        "active": False  # Inactive
    }
    
    create_response = requests.post(f"{API_URL}/printers", json=create_payload, timeout=10)
    
    if create_response.status_code == 200:
        print(f"   Created inactive printer for test")
        
        # Try to use it in gang-sheet
        gang_payload = {
            "printerCode": "test_inactive",
            "canvasWidthMm": 300,
            "designs": [
                {
                    "xMm": 10,
                    "yMm": 10,
                    "widthMm": 100,
                    "heightMm": 100,
                    "srcWidthPx": 1200,
                    "srcHeightPx": 1200,
                    "name": "test.png",
                    "imageUrl": "/uploads/designs/test.png"
                }
            ]
        }
        
        response = requests.post(f"{API_URL}/gang-sheets", json=gang_payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 400:
            print(f"✅ PASS - Inactive printer rejected with 400")
            print(f"   Error: {response.json().get('error')}")
        else:
            print(f"❌ FAIL - Expected 400, got {response.status_code}")
        
        # Cleanup: delete the test printer
        delete_payload = {"id": create_response.json().get('id')}
        requests.delete(f"{API_URL}/printers", json=delete_payload, timeout=10)
    else:
        print(f"⚠️  SKIP - Could not create inactive printer for test")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# C5: Diseño excede ancho → 400
print("\n[C5] POST /api/gang-sheets - Design exceeds canvas width → 400")
try:
    payload = {
        "printerCode": "prestige_r2_pro",
        "canvasWidthMm": 330,
        "designs": [
            {
                "xMm": 0,
                "yMm": 0,
                "widthMm": 400,  # Exceeds 330mm canvas
                "heightMm": 100,
                "srcWidthPx": 4800,
                "srcHeightPx": 1200,
                "name": "too-wide.png",
                "imageUrl": "/uploads/designs/too-wide.png"
            }
        ]
    }
    
    response = requests.post(f"{API_URL}/gang-sheets", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        print(f"✅ PASS - Design exceeding width rejected with 400")
        print(f"   Error: {response.json().get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# ============================================================================
# SECTION D: REGRESIÓN — endpoints previos deben seguir funcionando
# ============================================================================

print("\n\n📍 SECTION D: REGRESSION TESTS")
print("=" * 80)

# D1: POST /api/orders/public with payload transfer → 200
print("\n[D1] POST /api/orders/public - Create order (regression)")
try:
    products_response = requests.get(f"{API_URL}/products", timeout=10)
    if products_response.status_code == 200:
        products = products_response.json()
        if products and len(products) > 0:
            product = products[0]
            variant = product['variants'][0] if product.get('variants') else None
            
            if variant:
                payload = {
                    "customer": {
                        "name": "Pedro Sánchez",
                        "email": "pedro.sanchez@test.cl",
                        "phone": "+56987654321",
                        "rut": "15.678.234-K"
                    },
                    "deliveryMethod": "pickup",
                    "paymentMethod": "transfer",
                    "items": [
                        {
                            "productId": product['id'],
                            "variantId": variant['id'],
                            "quantity": 1
                        }
                    ]
                }
                
                response = requests.post(f"{API_URL}/orders/public", json=payload, timeout=10)
                print(f"Status: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    print(f"✅ PASS - Order created")
                    print(f"   Order: {data.get('orderNumber')}")
                else:
                    print(f"❌ FAIL - Expected 200, got {response.status_code}")
            else:
                print(f"⚠️  SKIP - No variants")
        else:
            print(f"⚠️  SKIP - No products")
    else:
        print(f"⚠️  SKIP - Could not fetch products")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# D2: GET /api/products → 4 items
print("\n[D2] GET /api/products - Regression")
try:
    response = requests.get(f"{API_URL}/products", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        if len(data) >= 4:
            print(f"✅ PASS - {len(data)} products")
        else:
            print(f"⚠️  WARNING - Expected 4+ products, got {len(data)}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# D3: GET /api/dashboard/summary → 200
print("\n[D3] GET /api/dashboard/summary - Regression")
try:
    response = requests.get(f"{API_URL}/dashboard/summary", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Dashboard summary working")
        print(f"   Sales: ${data.get('salesToday')}, Pending: {data.get('pendingOrders')}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# D4: POST /api/uploads/design with PNG → 200
print("\n[D4] POST /api/uploads/design - Regression")
try:
    img = Image.new('RGB', (100, 100), color='blue')
    img_bytes = BytesIO()
    img.save(img_bytes, format='PNG', dpi=(300, 300))
    img_bytes.seek(0)
    
    files = {'file': ('test-regression.png', img_bytes, 'image/png')}
    response = requests.post(f"{API_URL}/uploads/design", files=files, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Design upload working")
        print(f"   URL: {data.get('url')}, DPI: {data.get('dpi')}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# D5: POST /api/landings + GET /api/landings → still working
print("\n[D5] POST + GET /api/landings - Regression")
try:
    # Create a landing
    create_payload = {
        "slug": "test-regression-landing",
        "h1": "Test Regression",
        "active": True
    }
    
    create_response = requests.post(f"{API_URL}/landings", json=create_payload, timeout=10)
    print(f"POST Status: {create_response.status_code}")
    
    if create_response.status_code == 200:
        landing_id = create_response.json().get('id')
        print(f"✅ PASS - Landing created")
        
        # Get landings
        get_response = requests.get(f"{API_URL}/landings", timeout=10)
        if get_response.status_code == 200:
            landings = get_response.json()
            print(f"✅ PASS - GET landings working ({len(landings)} total)")
            
            # Cleanup
            delete_payload = {"id": landing_id}
            requests.delete(f"{API_URL}/landings", json=delete_payload, timeout=10)
        else:
            print(f"❌ FAIL - GET landings failed")
    else:
        print(f"❌ FAIL - POST landing failed")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# ============================================================================
# SUMMARY
# ============================================================================

print("\n\n" + "=" * 80)
print("🏁 ITERATION 4 BACKEND TESTING COMPLETE")
print("=" * 80)
print("\nTest suite executed. Review results above for pass/fail status.")
print("\nKey areas tested:")
print("  A) /api/printers CRUD (9 test groups, ~20 test cases)")
print("  B) /api/config extended (printersDynamic array)")
print("  C) /api/gang-sheets with dynamic printerCode (5 test cases)")
print("  D) Regression tests (5 test cases)")
print("\nBase URL tested:", API_URL)
