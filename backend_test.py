#!/usr/bin/env python3
"""
Backend Testing Suite for Estampados DLV - Iteration 3
Tests new /api/landings CRUD + regression tests + design upload fix verification
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

# Global variables to store created IDs for cleanup
created_landing_ids = []
created_order_number = None

# ============================================================================
# SECTION A: NEW /api/landings CRUD ENDPOINTS (PRIORITY)
# ============================================================================

print("\n📍 SECTION A: /api/landings CRUD (NEW - ITERATION 3)")
print("=" * 80)

# A1: GET /api/landings → should return array with at least 4 preexisting landings
print("\n[A1] GET /api/landings - List all landings")
try:
    response = requests.get(f"{API_URL}/landings", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Received {len(data)} landings")
        
        # Verify at least 4 preexisting landings
        if len(data) >= 4:
            print(f"✅ PASS - At least 4 landings exist (expected: dtf-textil-santiago, dtf-uv-santiago, dtf-textil-valparaiso, dtf-por-metro-chile)")
        else:
            print(f"⚠️  WARNING - Expected at least 4 landings, got {len(data)}")
        
        # Verify no _id in response
        has_mongo_id = any('_id' in item for item in data)
        if has_mongo_id:
            print(f"❌ FAIL - Response contains MongoDB _id field")
        else:
            print(f"✅ PASS - No MongoDB _id in response")
        
        # Check for expected slugs
        slugs = [item.get('slug') for item in data]
        expected_slugs = ['dtf-textil-santiago', 'dtf-uv-santiago', 'dtf-textil-valparaiso', 'dtf-por-metro-chile']
        found_slugs = [s for s in expected_slugs if s in slugs]
        print(f"   Found expected slugs: {found_slugs}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A2: GET /api/landings?active=true → only active landings
print("\n[A2] GET /api/landings?active=true - Filter active only")
try:
    response = requests.get(f"{API_URL}/landings?active=true", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Received {len(data)} active landings")
        
        # Verify all are active
        all_active = all(item.get('active') == True for item in data)
        if all_active:
            print(f"✅ PASS - All returned landings are active")
        else:
            print(f"❌ FAIL - Some landings are not active")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A3: POST /api/landings with valid payload → 200 with id, slug, createdAt, no _id
print("\n[A3] POST /api/landings - Create new landing with valid payload")
try:
    payload = {
        "slug": "dtf-textil-concepcion",
        "service": "dtf_textil",
        "location": {
            "city": "Concepción",
            "region": "Biobío"
        },
        "h1": "DTF Textil Concepción",
        "intro": "Servicio DTF en Concepción",
        "body": "Contenido de la landing page",
        "ctaText": "Cotiza",
        "keywords": ["dtf", "concepcion"],
        "active": True
    }
    
    response = requests.post(f"{API_URL}/landings", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Landing created successfully")
        
        # Verify response structure
        has_id = 'id' in data
        has_slug = 'slug' in data and data['slug'] == 'dtf-textil-concepcion'
        has_created_at = 'createdAt' in data
        has_mongo_id = '_id' in data
        
        if has_id:
            print(f"✅ PASS - Response has UUID id: {data['id']}")
            created_landing_ids.append(data['id'])
        else:
            print(f"❌ FAIL - Response missing 'id' field")
        
        if has_slug:
            print(f"✅ PASS - Response has correct slug: {data['slug']}")
        else:
            print(f"❌ FAIL - Response missing or incorrect 'slug' field")
        
        if has_created_at:
            print(f"✅ PASS - Response has 'createdAt' timestamp")
        else:
            print(f"❌ FAIL - Response missing 'createdAt' field")
        
        if has_mongo_id:
            print(f"❌ FAIL - Response contains MongoDB _id field")
        else:
            print(f"✅ PASS - No MongoDB _id in response")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A4: POST /api/landings with duplicate slug → 409
print("\n[A4] POST /api/landings - Duplicate slug should return 409")
try:
    payload = {
        "slug": "dtf-textil-concepcion",  # Same as A3
        "h1": "Another landing",
        "active": True
    }
    
    response = requests.post(f"{API_URL}/landings", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 409:
        print(f"✅ PASS - Duplicate slug correctly rejected with 409")
        data = response.json()
        print(f"   Error message: {data.get('error')}")
    else:
        print(f"❌ FAIL - Expected 409, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A5: POST /api/landings with invalid slug (uppercase + spaces) → 400
print("\n[A5] POST /api/landings - Invalid slug (uppercase + spaces) should return 400")
try:
    payload = {
        "slug": "DTF Textil Santiago",  # Invalid: uppercase + spaces
        "h1": "Test landing",
        "active": True
    }
    
    response = requests.post(f"{API_URL}/landings", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        print(f"✅ PASS - Invalid slug correctly rejected with 400")
        data = response.json()
        print(f"   Error message: {data.get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A6: POST /api/landings without h1 → 400
print("\n[A6] POST /api/landings - Missing h1 should return 400")
try:
    payload = {
        "slug": "test-landing-no-h1"
        # Missing h1
    }
    
    response = requests.post(f"{API_URL}/landings", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        print(f"✅ PASS - Missing h1 correctly rejected with 400")
        data = response.json()
        print(f"   Error message: {data.get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A7: PATCH /api/landings {id, active:false} → 200, doc updated
print("\n[A7] PATCH /api/landings - Update active status to false")
try:
    if created_landing_ids:
        landing_id = created_landing_ids[0]
        payload = {
            "id": landing_id,
            "active": False
        }
        
        response = requests.patch(f"{API_URL}/landings", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ PASS - Landing updated successfully")
            
            if data.get('active') == False:
                print(f"✅ PASS - active field correctly set to false")
            else:
                print(f"❌ FAIL - active field not updated correctly")
            
            if 'updatedAt' in data:
                print(f"✅ PASS - updatedAt timestamp present")
            else:
                print(f"❌ FAIL - updatedAt timestamp missing")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
    else:
        print(f"⚠️  SKIP - No landing ID available from A3")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A8: PATCH /api/landings {id, slug:'nuevo-slug-test'} → 200, slug updated
print("\n[A8] PATCH /api/landings - Update slug")
try:
    if created_landing_ids:
        landing_id = created_landing_ids[0]
        payload = {
            "id": landing_id,
            "slug": "dtf-textil-concepcion-actualizado"
        }
        
        response = requests.patch(f"{API_URL}/landings", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ PASS - Landing slug updated successfully")
            
            if data.get('slug') == 'dtf-textil-concepcion-actualizado':
                print(f"✅ PASS - slug correctly updated to: {data['slug']}")
            else:
                print(f"❌ FAIL - slug not updated correctly, got: {data.get('slug')}")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
    else:
        print(f"⚠️  SKIP - No landing ID available from A3")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# A9: DELETE /api/landings {id} → 200 {ok:true}, second DELETE → 404
print("\n[A9] DELETE /api/landings - Delete landing and verify 404 on second delete")
try:
    if created_landing_ids:
        landing_id = created_landing_ids[0]
        payload = {"id": landing_id}
        
        # First delete
        response = requests.delete(f"{API_URL}/landings", json=payload, timeout=10)
        print(f"First DELETE status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok') == True:
                print(f"✅ PASS - Landing deleted successfully, response: {data}")
            else:
                print(f"❌ FAIL - Expected {{ok: true}}, got: {data}")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
        
        # Second delete (should fail with 404)
        response2 = requests.delete(f"{API_URL}/landings", json=payload, timeout=10)
        print(f"Second DELETE status: {response2.status_code}")
        
        if response2.status_code == 404:
            print(f"✅ PASS - Second delete correctly returns 404")
        else:
            print(f"❌ FAIL - Expected 404 on second delete, got {response2.status_code}")
    else:
        print(f"⚠️  SKIP - No landing ID available from A3")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# ============================================================================
# SECTION B: REGRESSION TESTS - Previous endpoints must still work
# ============================================================================

print("\n\n📍 SECTION B: REGRESSION TESTS")
print("=" * 80)

# B1: POST /api/seed → 200 with counts, idempotent
print("\n[B1] POST /api/seed - Seed database (idempotency test)")
try:
    # First seed
    response1 = requests.post(f"{API_URL}/seed", timeout=15)
    print(f"First seed status: {response1.status_code}")
    
    if response1.status_code == 200:
        data1 = response1.json()
        print(f"✅ PASS - First seed successful")
        print(f"   Counts: users={data1['seeded'].get('users')}, products={data1['seeded'].get('products')}, orders={data1['seeded'].get('orders')}")
        
        # Second seed (idempotency test)
        response2 = requests.post(f"{API_URL}/seed", timeout=15)
        print(f"Second seed status: {response2.status_code}")
        
        if response2.status_code == 200:
            data2 = response2.json()
            print(f"✅ PASS - Second seed successful (idempotent)")
            print(f"   Counts: users={data2['seeded'].get('users')}, products={data2['seeded'].get('products')}, orders={data2['seeded'].get('orders')}")
            
            # Verify counts match
            if data1['seeded'] == data2['seeded']:
                print(f"✅ PASS - Counts match between both seeds (idempotent)")
            else:
                print(f"⚠️  WARNING - Counts differ between seeds")
        else:
            print(f"❌ FAIL - Second seed failed with {response2.status_code}")
    else:
        print(f"❌ FAIL - Expected 200, got {response1.status_code}")
        print(f"   Response: {response1.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# B2: GET /api/products → 200 array (4 items), no _id
print("\n[B2] GET /api/products - List products")
try:
    response = requests.get(f"{API_URL}/products", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Received {len(data)} products")
        
        if len(data) >= 4:
            print(f"✅ PASS - At least 4 products exist")
        else:
            print(f"⚠️  WARNING - Expected at least 4 products, got {len(data)}")
        
        # Verify no _id
        has_mongo_id = any('_id' in item for item in data)
        if has_mongo_id:
            print(f"❌ FAIL - Response contains MongoDB _id field")
        else:
            print(f"✅ PASS - No MongoDB _id in response")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# B3: GET /api/dashboard/summary → 200 with salesToday, pendingOrders, printerQueues
print("\n[B3] GET /api/dashboard/summary - Dashboard KPIs")
try:
    response = requests.get(f"{API_URL}/dashboard/summary", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Dashboard summary retrieved")
        
        required_fields = ['salesToday', 'pendingOrders', 'printerQueues']
        missing_fields = [f for f in required_fields if f not in data]
        
        if not missing_fields:
            print(f"✅ PASS - All required fields present")
            print(f"   salesToday: ${data['salesToday']}")
            print(f"   pendingOrders: {data['pendingOrders']}")
            print(f"   printerQueues: {data['printerQueues']}")
        else:
            print(f"❌ FAIL - Missing fields: {missing_fields}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# B4: GET /api/config → 200 with PRINTER_SPECS
print("\n[B4] GET /api/config - Printer specs and enums")
try:
    response = requests.get(f"{API_URL}/config", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Config retrieved")
        
        if 'printers' in data:
            printers = data['printers']
            print(f"✅ PASS - Printer specs present")
            
            # Verify specific printers
            if 'epson_r1390' in printers and printers['epson_r1390']['maxWidthCm'] == 31:
                print(f"✅ PASS - Epson R1390: 31cm")
            else:
                print(f"❌ FAIL - Epson R1390 spec incorrect")
            
            if 'prestige_r2_pro' in printers and printers['prestige_r2_pro']['maxWidthCm'] == 33:
                print(f"✅ PASS - Prestige R2 Pro: 33cm")
            else:
                print(f"❌ FAIL - Prestige R2 Pro spec incorrect")
            
            if 'dtf_uv' in printers and 'V' in printers['dtf_uv'].get('channels', []):
                print(f"✅ PASS - DTF UV has Varnish channel (V)")
            else:
                print(f"❌ FAIL - DTF UV missing Varnish channel")
        else:
            print(f"❌ FAIL - Missing 'printers' field")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# B5: POST /api/orders/public with realistic payload → 200 with orderNumber
print("\n[B5] POST /api/orders/public - Create public order")
try:
    # First get a product to use in the order
    products_response = requests.get(f"{API_URL}/products", timeout=10)
    if products_response.status_code == 200:
        products = products_response.json()
        if products and len(products) > 0:
            product = products[0]
            variant = product['variants'][0] if product.get('variants') else None
            
            if variant:
                payload = {
                    "customer": {
                        "name": "María González",
                        "email": "maria.gonzalez@test.cl",
                        "phone": "+56912345678",
                        "rut": "12.345.678-9"
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
                    print(f"✅ PASS - Order created successfully")
                    
                    if 'orderNumber' in data and data['orderNumber'].startswith('DLV-2025-'):
                        print(f"✅ PASS - Order number format correct: {data['orderNumber']}")
                        created_order_number = data['orderNumber']
                    else:
                        print(f"❌ FAIL - Order number format incorrect: {data.get('orderNumber')}")
                    
                    print(f"   Order ID: {data.get('orderId')}")
                    print(f"   Total: ${data.get('total')}")
                else:
                    print(f"❌ FAIL - Expected 200, got {response.status_code}")
                    print(f"   Response: {response.text}")
            else:
                print(f"⚠️  SKIP - No variants available in product")
        else:
            print(f"⚠️  SKIP - No products available")
    else:
        print(f"⚠️  SKIP - Could not fetch products")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# B6: GET /api/orders/lookup?number=<orderNumber> → 200 with order and items
print("\n[B6] GET /api/orders/lookup - Lookup order by number")
try:
    if created_order_number:
        response = requests.get(f"{API_URL}/orders/lookup?number={created_order_number}", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ PASS - Order lookup successful")
            
            if 'order' in data and 'items' in data:
                print(f"✅ PASS - Response contains order and items")
                print(f"   Order number: {data['order'].get('orderNumber')}")
                print(f"   Items count: {len(data['items'])}")
            else:
                print(f"❌ FAIL - Missing 'order' or 'items' in response")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
    else:
        print(f"⚠️  SKIP - No order number available from B5")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# ============================================================================
# SECTION C: RE-VERIFY DESIGN UPLOAD FIX
# ============================================================================

print("\n\n📍 SECTION C: RE-VERIFY DESIGN UPLOAD FIX")
print("=" * 80)

# C1: POST /api/uploads/design with PNG multipart → 200 with metadata
print("\n[C1] POST /api/uploads/design - Upload PNG with DPI detection")
try:
    # Create a small test PNG image
    img = Image.new('RGB', (100, 100), color='red')
    img_bytes = BytesIO()
    img.save(img_bytes, format='PNG', dpi=(300, 300))
    img_bytes.seek(0)
    
    files = {'file': ('test-design.png', img_bytes, 'image/png')}
    response = requests.post(f"{API_URL}/uploads/design", files=files, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Design uploaded successfully")
        
        required_fields = ['id', 'url', 'widthPx', 'heightPx', 'dpi', 'sizeBytes']
        missing_fields = [f for f in required_fields if f not in data]
        
        if not missing_fields:
            print(f"✅ PASS - All required fields present")
            print(f"   ID: {data['id']}")
            print(f"   URL: {data['url']}")
            print(f"   Dimensions: {data['widthPx']}x{data['heightPx']}px")
            print(f"   DPI: {data['dpi']}")
            print(f"   Size: {data['sizeBytes']} bytes")
            
            # Verify file exists
            file_path = f"/app/public{data['url']}"
            if os.path.exists(file_path):
                print(f"✅ PASS - File exists at {file_path}")
            else:
                print(f"❌ FAIL - File not found at {file_path}")
        else:
            print(f"❌ FAIL - Missing fields: {missing_fields}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# ============================================================================
# SECTION D: GANG SHEET VALIDATION (REGRESSION)
# ============================================================================

print("\n\n📍 SECTION D: GANG SHEET VALIDATION")
print("=" * 80)

# D1: Happy path - dtf_textil_33 with valid design
print("\n[D1] POST /api/gang-sheets - Happy path (dtf_textil_33)")
try:
    payload = {
        "mode": "dtf_textil_33",
        "canvasWidthMm": 330,
        "designs": [
            {
                "xMm": 10,
                "yMm": 10,
                "widthMm": 300,
                "heightMm": 500
            }
        ]
    }
    
    response = requests.post(f"{API_URL}/gang-sheets", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PASS - Gang sheet created successfully")
        print(f"   Order number: {data.get('orderNumber')}")
        print(f"   Printer: {data.get('printerLabel')}")
        print(f"   Total: ${data.get('total')}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# D2: Reject - dtf_textil_31 with canvas exceeding max width
print("\n[D2] POST /api/gang-sheets - Reject canvas exceeding printer max (dtf_textil_31)")
try:
    payload = {
        "mode": "dtf_textil_31",
        "canvasWidthMm": 320,  # Exceeds 31cm (310mm)
        "designs": [
            {
                "xMm": 10,
                "yMm": 10,
                "widthMm": 100,
                "heightMm": 100
            }
        ]
    }
    
    response = requests.post(f"{API_URL}/gang-sheets", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        print(f"✅ PASS - Canvas width correctly rejected with 400")
        data = response.json()
        print(f"   Error message: {data.get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {str(e)}")

# ============================================================================
# SUMMARY
# ============================================================================

print("\n\n" + "=" * 80)
print("🏁 BACKEND TESTING COMPLETE")
print("=" * 80)
print("\nTest suite executed. Review results above for pass/fail status.")
print("All tests use realistic Chilean data as per requirements.")
print("\nBase URL tested:", API_URL)
