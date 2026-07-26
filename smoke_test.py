#!/usr/bin/env python3
"""
Smoke test rápido post-rebuild del cache Next.js
Verifica que todos los endpoints críticos respondan 200 con JSON válido, sin _id
"""
import requests
import json
import time
from datetime import datetime

BASE_URL = "https://dtf-print-hub-2.preview.emergentagent.com/api"

def test_endpoint(method, path, expected_status=200, payload=None, description=""):
    """Test single endpoint and return result"""
    url = f"{BASE_URL}{path}"
    start = time.time()
    
    try:
        if method == "GET":
            resp = requests.get(url, timeout=10)
        elif method == "POST":
            resp = requests.post(url, json=payload, timeout=10)
        else:
            return {"pass": False, "error": f"Unsupported method {method}"}
        
        elapsed = time.time() - start
        
        # Check status
        if resp.status_code != expected_status:
            return {
                "pass": False,
                "status": resp.status_code,
                "expected": expected_status,
                "elapsed": f"{elapsed:.2f}s",
                "body": resp.text[:200]
            }
        
        # Check JSON
        try:
            data = resp.json()
        except:
            return {
                "pass": False,
                "status": resp.status_code,
                "error": "Invalid JSON",
                "elapsed": f"{elapsed:.2f}s",
                "body": resp.text[:200]
            }
        
        # Check for _id (regression)
        data_str = json.dumps(data)
        if '"_id"' in data_str:
            return {
                "pass": False,
                "status": resp.status_code,
                "error": "REGRESSION: Found _id in response",
                "elapsed": f"{elapsed:.2f}s"
            }
        
        return {
            "pass": True,
            "status": resp.status_code,
            "elapsed": f"{elapsed:.2f}s",
            "data": data
        }
        
    except Exception as e:
        return {
            "pass": False,
            "error": str(e),
            "elapsed": f"{time.time() - start:.2f}s"
        }

def main():
    print("=" * 80)
    print("SMOKE TEST - Post Next.js Cache Rebuild")
    print(f"Base URL: {BASE_URL}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print()
    
    start_time = time.time()
    results = []
    
    # Test 1: GET /api/products
    print("1. GET /api/products → array de 4 productos")
    r = test_endpoint("GET", "/products")
    results.append(("GET /api/products", r))
    if r["pass"]:
        count = len(r["data"]) if isinstance(r["data"], list) else 0
        print(f"   ✅ PASS - {count} productos - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 2: GET /api/dashboard/summary
    print("2. GET /api/dashboard/summary → objeto con salesToday, pendingOrders, printerQueues")
    r = test_endpoint("GET", "/dashboard/summary")
    results.append(("GET /api/dashboard/summary", r))
    if r["pass"]:
        data = r["data"]
        print(f"   ✅ PASS - salesToday=${data.get('salesToday', 0)}, pendingOrders={data.get('pendingOrders', 0)} - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 3: GET /api/config
    print("3. GET /api/config → objeto con printers, printersDynamic, enums")
    r = test_endpoint("GET", "/config")
    results.append(("GET /api/config", r))
    if r["pass"]:
        data = r["data"]
        has_printers = "printers" in data
        has_dynamic = "printersDynamic" in data
        has_enums = "enums" in data
        print(f"   ✅ PASS - printers={has_printers}, printersDynamic={has_dynamic}, enums={has_enums} - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 4: GET /api/printers
    print("4. GET /api/printers → array de 3+ printers")
    r = test_endpoint("GET", "/printers")
    results.append(("GET /api/printers", r))
    if r["pass"]:
        count = len(r["data"]) if isinstance(r["data"], list) else 0
        print(f"   ✅ PASS - {count} printers - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 5: GET /api/printers?active=true
    print("5. GET /api/printers?active=true → array solo con activos")
    r = test_endpoint("GET", "/printers?active=true")
    results.append(("GET /api/printers?active=true", r))
    if r["pass"]:
        count = len(r["data"]) if isinstance(r["data"], list) else 0
        print(f"   ✅ PASS - {count} activos - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 6: GET /api/production/queue
    print("6. GET /api/production/queue → array de items en cola")
    r = test_endpoint("GET", "/production/queue")
    results.append(("GET /api/production/queue", r))
    if r["pass"]:
        count = len(r["data"]) if isinstance(r["data"], list) else 0
        print(f"   ✅ PASS - {count} items - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 7: GET /api/orders
    print("7. GET /api/orders → lista de órdenes")
    r = test_endpoint("GET", "/orders")
    results.append(("GET /api/orders", r))
    if r["pass"]:
        count = len(r["data"]) if isinstance(r["data"], list) else 0
        print(f"   ✅ PASS - {count} órdenes - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 8: GET /api/inventory/commercial
    print("8. GET /api/inventory/commercial → array de stock")
    r = test_endpoint("GET", "/inventory/commercial")
    results.append(("GET /api/inventory/commercial", r))
    if r["pass"]:
        count = len(r["data"]) if isinstance(r["data"], list) else 0
        print(f"   ✅ PASS - {count} items - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 9: GET /api/inventory/supplies
    print("9. GET /api/inventory/supplies → array de insumos")
    r = test_endpoint("GET", "/inventory/supplies")
    results.append(("GET /api/inventory/supplies", r))
    if r["pass"]:
        count = len(r["data"]) if isinstance(r["data"], list) else 0
        print(f"   ✅ PASS - {count} insumos - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 10: GET /api/taxonomies?kind=product_category
    print("10. GET /api/taxonomies?kind=product_category → array de categorías")
    r = test_endpoint("GET", "/taxonomies?kind=product_category")
    results.append(("GET /api/taxonomies?kind=product_category", r))
    if r["pass"]:
        count = len(r["data"]) if isinstance(r["data"], list) else 0
        print(f"   ✅ PASS - {count} categorías - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 11: GET /api/landings
    print("11. GET /api/landings → array de landings SEO")
    r = test_endpoint("GET", "/landings")
    results.append(("GET /api/landings", r))
    if r["pass"]:
        count = len(r["data"]) if isinstance(r["data"], list) else 0
        print(f"   ✅ PASS - {count} landings - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 12: GET /api/landings?active=true
    print("12. GET /api/landings?active=true → activas")
    r = test_endpoint("GET", "/landings?active=true")
    results.append(("GET /api/landings?active=true", r))
    if r["pass"]:
        count = len(r["data"]) if isinstance(r["data"], list) else 0
        print(f"   ✅ PASS - {count} activas - {r['elapsed']}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Test 13: POST /api/seed
    print("13. POST /api/seed → 200 con seeded conteos")
    r = test_endpoint("POST", "/seed")
    results.append(("POST /api/seed", r))
    if r["pass"]:
        data = r["data"]
        seeded = data.get("seeded", {})
        printers = seeded.get("printers", 0)
        products = seeded.get("products", 0)
        print(f"   ✅ PASS - printers={printers}, products={products} - {r['elapsed']}")
        if printers != 3:
            print(f"   ⚠️  WARNING: Expected printers=3, got {printers}")
        if products != 4:
            print(f"   ⚠️  WARNING: Expected products=4, got {products}")
    else:
        print(f"   ❌ FAIL - {r.get('error', r.get('status'))} - {r['elapsed']}")
    
    # Summary
    total_time = time.time() - start_time
    passed = sum(1 for _, r in results if r["pass"])
    failed = len(results) - passed
    
    print()
    print("=" * 80)
    print(f"SMOKE TEST COMPLETE")
    print(f"Total: {len(results)} tests | Passed: {passed} ✅ | Failed: {failed} ❌")
    print(f"Total time: {total_time:.2f}s")
    print("=" * 80)
    
    if failed > 0:
        print()
        print("FAILED TESTS:")
        for endpoint, r in results:
            if not r["pass"]:
                print(f"  ❌ {endpoint}")
                print(f"     Error: {r.get('error', r.get('status'))}")
                if "body" in r:
                    print(f"     Body: {r['body']}")
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
