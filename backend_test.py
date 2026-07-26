#!/usr/bin/env python3
"""
Comprehensive backend API test for Estampados DLV
Tests all endpoints with focus on hardware validation and pricing logic
"""

import requests
import json
import io
from PIL import Image
import os

# Read BASE_URL from .env
BASE_URL = "https://dtf-print-hub-2.preview.emergentagent.com/api"

def print_test(name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {name}")
    if details:
        print(f"  {details}")

def test_health():
    """Test GET /api/ health check"""
    print("\n" + "="*80)
    print("TEST 1: Health Check")
    print("="*80)
    
    try:
        r = requests.get(f"{BASE_URL}/", timeout=10)
        data = r.json()
        
        passed = (
            r.status_code == 200 and
            data.get('service') == 'Estampados DLV · Sistema Operativo' and
            data.get('status') == 'ok'
        )
        
        print_test("Health endpoint", passed, 
                  f"Status: {r.status_code}, Service: {data.get('service')}, Status: {data.get('status')}")
        return passed
    except Exception as e:
        print_test("Health endpoint", False, f"Error: {str(e)}")
        return False

def test_seed():
    """Test POST /api/seed - call twice for idempotency"""
    print("\n" + "="*80)
    print("TEST 2: Seed Endpoint (Idempotency)")
    print("="*80)
    
    results = []
    
    for attempt in [1, 2]:
        try:
            print(f"\n  Attempt {attempt}:")
            r = requests.post(f"{BASE_URL}/seed", timeout=15)
            data = r.json()
            
            expected_counts = {
                'users': 3,
                'products': 4,
                'commercialStock': 8,
                'supplies': 9,
                'orders': 5,
                'orderItems': 5,
                'productionQueue': 5
            }
            
            passed = (
                r.status_code == 200 and
                data.get('ok') == True and
                all(data.get('seeded', {}).get(k) == v for k, v in expected_counts.items())
            )
            
            print_test(f"Seed attempt {attempt}", passed,
                      f"Status: {r.status_code}, Counts: {data.get('seeded')}")
            results.append(passed)
            
        except Exception as e:
            print_test(f"Seed attempt {attempt}", False, f"Error: {str(e)}")
            results.append(False)
    
    return all(results)

def test_config():
    """Test GET /api/config"""
    print("\n" + "="*80)
    print("TEST 3: Config Endpoint")
    print("="*80)
    
    try:
        r = requests.get(f"{BASE_URL}/config", timeout=10)
        data = r.json()
        
        printers = data.get('printers', {})
        
        passed = (
            r.status_code == 200 and
            printers.get('epson_r1390', {}).get('maxWidthCm') == 31 and
            printers.get('prestige_r2_pro', {}).get('maxWidthCm') == 33 and
            'V' in printers.get('dtf_uv', {}).get('channels', [])
        )
        
        print_test("Config endpoint", passed,
                  f"Status: {r.status_code}, Epson max: {printers.get('epson_r1390', {}).get('maxWidthCm')}cm, "
                  f"Prestige max: {printers.get('prestige_r2_pro', {}).get('maxWidthCm')}cm, "
                  f"DTF UV channels: {printers.get('dtf_uv', {}).get('channels')}")
        return passed
        
    except Exception as e:
        print_test("Config endpoint", False, f"Error: {str(e)}")
        return False

def test_pricing():
    """Test GET /api/pricing"""
    print("\n" + "="*80)
    print("TEST 4: Pricing Endpoint")
    print("="*80)
    
    try:
        r = requests.get(f"{BASE_URL}/pricing", timeout=10)
        data = r.json()
        
        passed = (
            r.status_code == 200 and
            data.get('dtf_textil_31', {}).get('pricePerMm') == 10 and
            data.get('dtf_textil_33', {}).get('pricePerMm') == 12 and
            data.get('dtf_uv', {}).get('pricePerMm') == 28
        )
        
        print_test("Pricing endpoint", passed,
                  f"Status: {r.status_code}, Prices: 31cm=${data.get('dtf_textil_31', {}).get('pricePerMm')}/mm, "
                  f"33cm=${data.get('dtf_textil_33', {}).get('pricePerMm')}/mm, "
                  f"UV=${data.get('dtf_uv', {}).get('pricePerMm')}/mm")
        return passed
        
    except Exception as e:
        print_test("Pricing endpoint", False, f"Error: {str(e)}")
        return False

def test_dashboard():
    """Test GET /api/dashboard/summary"""
    print("\n" + "="*80)
    print("TEST 5: Dashboard Summary")
    print("="*80)
    
    try:
        r = requests.get(f"{BASE_URL}/dashboard/summary", timeout=10)
        data = r.json()
        
        passed = (
            r.status_code == 200 and
            data.get('salesToday', 0) > 0 and
            data.get('pendingOrders', 0) > 0 and
            'printerQueues' in data and
            isinstance(data.get('recentActivity'), list)
        )
        
        print_test("Dashboard summary", passed,
                  f"Status: {r.status_code}, Sales today: ${data.get('salesToday')}, "
                  f"Pending orders: {data.get('pendingOrders')}, "
                  f"Printer queues: {data.get('printerQueues')}, "
                  f"Recent activity items: {len(data.get('recentActivity', []))}")
        return passed
        
    except Exception as e:
        print_test("Dashboard summary", False, f"Error: {str(e)}")
        return False

def test_upload():
    """Test POST /api/uploads/design"""
    print("\n" + "="*80)
    print("TEST 6: Design Upload")
    print("="*80)
    
    results = []
    
    # Test 6a: Valid upload
    try:
        # Create a small PNG in memory
        img = Image.new('RGB', (3000, 3000), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG', dpi=(300, 300))
        img_bytes.seek(0)
        
        files = {'file': ('test_logo.png', img_bytes, 'image/png')}
        r = requests.post(f"{BASE_URL}/uploads/design", files=files, timeout=15)
        data = r.json()
        
        passed = (
            r.status_code == 200 and
            'id' in data and
            data.get('url', '').startswith('/uploads/designs/') and
            data.get('widthPx') > 0 and
            data.get('heightPx') > 0 and
            data.get('sizeBytes') > 0
        )
        
        # Verify file exists
        if passed:
            file_path = f"/app/public{data.get('url')}"
            file_exists = os.path.exists(file_path)
            passed = passed and file_exists
            
            print_test("Upload valid design", passed,
                      f"Status: {r.status_code}, ID: {data.get('id')}, URL: {data.get('url')}, "
                      f"Size: {data.get('widthPx')}x{data.get('heightPx')}px, "
                      f"DPI: {data.get('dpi')}, Bytes: {data.get('sizeBytes')}, "
                      f"File exists: {file_exists}")
        else:
            print_test("Upload valid design", passed,
                      f"Status: {r.status_code}, Response: {data}")
        
        results.append(passed)
        
    except Exception as e:
        print_test("Upload valid design", False, f"Error: {str(e)}")
        results.append(False)
    
    # Test 6b: Missing file (should return 400)
    try:
        r = requests.post(f"{BASE_URL}/uploads/design", timeout=10)
        passed = r.status_code == 400
        
        print_test("Upload without file (should fail)", passed,
                  f"Status: {r.status_code} (expected 400)")
        results.append(passed)
        
    except Exception as e:
        print_test("Upload without file", False, f"Error: {str(e)}")
        results.append(False)
    
    return all(results)

def test_gang_sheets():
    """Test POST /api/gang-sheets with multiple scenarios"""
    print("\n" + "="*80)
    print("TEST 7: Gang Sheet Creation & Validation")
    print("="*80)
    
    results = []
    
    # Test 7a: Happy path (dtf_textil_33)
    try:
        payload = {
            "mode": "dtf_textil_33",
            "canvasWidthMm": 330,
            "express": False,
            "designs": [
                {
                    "imageUrl": "/uploads/designs/test.png",
                    "name": "logo.png",
                    "srcWidthPx": 3000,
                    "srcHeightPx": 3000,
                    "xMm": 10,
                    "yMm": 10,
                    "widthMm": 200,
                    "heightMm": 500,
                    "rotation": 0
                }
            ]
        }
        
        r = requests.post(f"{BASE_URL}/gang-sheets", json=payload, timeout=15)
        data = r.json()
        
        # Expected: lengthMm = max(510 + 20, 300) = 530
        # subtotal = 530 * 12 = 6360
        # tax = 6360 * 0.19 = 1208 (rounded)
        # total = 6360 + 1208 = 7568
        
        expected_length = 530
        expected_subtotal = 6360
        expected_total = 7568
        
        passed = (
            r.status_code == 200 and
            data.get('lengthMm') == expected_length and
            data.get('quote', {}).get('subtotal') == expected_subtotal and
            data.get('total') == expected_total and
            data.get('orderNumber', '').startswith('DLV-2025-') and
            data.get('printerLabel') == 'Prestige R2 Pro'
        )
        
        print_test("Gang sheet happy path (dtf_textil_33)", passed,
                  f"Status: {r.status_code}, Order: {data.get('orderNumber')}, "
                  f"Length: {data.get('lengthMm')}mm (expected {expected_length}), "
                  f"Subtotal: ${data.get('quote', {}).get('subtotal')} (expected ${expected_subtotal}), "
                  f"Total: ${data.get('total')} (expected ${expected_total}), "
                  f"Printer: {data.get('printerLabel')}")
        results.append(passed)
        
    except Exception as e:
        print_test("Gang sheet happy path", False, f"Error: {str(e)}")
        results.append(False)
    
    # Test 7b: Minimum length rule (dtf_textil_31, tiny design)
    try:
        payload = {
            "mode": "dtf_textil_31",
            "canvasWidthMm": 310,
            "express": False,
            "designs": [
                {
                    "imageUrl": "/uploads/designs/tiny.png",
                    "name": "tiny.png",
                    "srcWidthPx": 100,
                    "srcHeightPx": 100,
                    "xMm": 10,
                    "yMm": 10,
                    "widthMm": 50,
                    "heightMm": 10,
                    "rotation": 0
                }
            ]
        }
        
        r = requests.post(f"{BASE_URL}/gang-sheets", json=payload, timeout=15)
        data = r.json()
        
        # Expected: lengthMm = max(30, 300) = 300 (minimum)
        # subtotal = 300 * 10 = 3000
        # tax = 3000 * 0.19 = 570
        # total = 3000 + 570 = 3570
        
        expected_length = 300
        expected_subtotal = 3000
        expected_total = 3570
        
        passed = (
            r.status_code == 200 and
            data.get('lengthMm') == expected_length and
            data.get('quote', {}).get('subtotal') == expected_subtotal and
            data.get('total') == expected_total
        )
        
        print_test("Gang sheet minimum length (dtf_textil_31)", passed,
                  f"Status: {r.status_code}, "
                  f"Length: {data.get('lengthMm')}mm (expected {expected_length}), "
                  f"Subtotal: ${data.get('quote', {}).get('subtotal')} (expected ${expected_subtotal}), "
                  f"Total: ${data.get('total')} (expected ${expected_total})")
        results.append(passed)
        
    except Exception as e:
        print_test("Gang sheet minimum length", False, f"Error: {str(e)}")
        results.append(False)
    
    # Test 7c: Express surcharge
    try:
        payload = {
            "mode": "dtf_textil_33",
            "canvasWidthMm": 330,
            "express": True,
            "designs": [
                {
                    "imageUrl": "/uploads/designs/test.png",
                    "name": "logo.png",
                    "srcWidthPx": 3000,
                    "srcHeightPx": 3000,
                    "xMm": 10,
                    "yMm": 10,
                    "widthMm": 200,
                    "heightMm": 500,
                    "rotation": 0
                }
            ]
        }
        
        r = requests.post(f"{BASE_URL}/gang-sheets", json=payload, timeout=15)
        data = r.json()
        
        # Expected: lengthMm = 530
        # subtotal = 530 * 12 = 6360
        # surcharge = 6360 * 0.30 = 1908
        # netAmount = 6360 + 1908 = 8268
        # tax = 8268 * 0.19 = 1571 (rounded)
        # total = 8268 + 1571 = 9839
        
        expected_subtotal = 6360
        expected_surcharge = 1908
        expected_net = 8268
        expected_tax = 1571
        expected_total = 9839
        
        quote = data.get('quote', {})
        
        passed = (
            r.status_code == 200 and
            quote.get('subtotal') == expected_subtotal and
            quote.get('surcharge') == expected_surcharge and
            quote.get('netAmount') == expected_net and
            quote.get('tax') == expected_tax and
            data.get('total') == expected_total and
            quote.get('express') == True
        )
        
        print_test("Gang sheet express surcharge", passed,
                  f"Status: {r.status_code}, "
                  f"Subtotal: ${quote.get('subtotal')} (expected ${expected_subtotal}), "
                  f"Surcharge: ${quote.get('surcharge')} (expected ${expected_surcharge}), "
                  f"Net: ${quote.get('netAmount')} (expected ${expected_net}), "
                  f"Tax: ${quote.get('tax')} (expected ${expected_tax}), "
                  f"Total: ${data.get('total')} (expected ${expected_total})")
        results.append(passed)
        
    except Exception as e:
        print_test("Gang sheet express surcharge", False, f"Error: {str(e)}")
        results.append(False)
    
    # Test 7d: Reject when design exceeds canvas width
    try:
        payload = {
            "mode": "dtf_textil_31",
            "canvasWidthMm": 310,
            "express": False,
            "designs": [
                {
                    "imageUrl": "/uploads/designs/wide.png",
                    "name": "wide.png",
                    "srcWidthPx": 1000,
                    "srcHeightPx": 1000,
                    "xMm": 0,
                    "yMm": 0,
                    "widthMm": 320,
                    "heightMm": 100,
                    "rotation": 0
                }
            ]
        }
        
        r = requests.post(f"{BASE_URL}/gang-sheets", json=payload, timeout=15)
        passed = r.status_code == 400
        
        print_test("Gang sheet reject design exceeds canvas", passed,
                  f"Status: {r.status_code} (expected 400), Error: {r.json().get('error')}")
        results.append(passed)
        
    except Exception as e:
        print_test("Gang sheet reject design exceeds canvas", False, f"Error: {str(e)}")
        results.append(False)
    
    # Test 7e: Reject when canvasWidthMm exceeds printer max
    try:
        payload = {
            "mode": "dtf_textil_33",
            "canvasWidthMm": 340,
            "express": False,
            "designs": [
                {
                    "imageUrl": "/uploads/designs/test.png",
                    "name": "test.png",
                    "srcWidthPx": 1000,
                    "srcHeightPx": 1000,
                    "xMm": 10,
                    "yMm": 10,
                    "widthMm": 100,
                    "heightMm": 100,
                    "rotation": 0
                }
            ]
        }
        
        r = requests.post(f"{BASE_URL}/gang-sheets", json=payload, timeout=15)
        passed = r.status_code == 400
        
        print_test("Gang sheet reject canvas exceeds printer max", passed,
                  f"Status: {r.status_code} (expected 400), Error: {r.json().get('error')}")
        results.append(passed)
        
    except Exception as e:
        print_test("Gang sheet reject canvas exceeds printer max", False, f"Error: {str(e)}")
        results.append(False)
    
    # Test 7f: Reject empty designs
    try:
        payload = {
            "mode": "dtf_textil_31",
            "canvasWidthMm": 310,
            "express": False,
            "designs": []
        }
        
        r = requests.post(f"{BASE_URL}/gang-sheets", json=payload, timeout=15)
        passed = r.status_code == 400
        
        print_test("Gang sheet reject empty designs", passed,
                  f"Status: {r.status_code} (expected 400), Error: {r.json().get('error')}")
        results.append(passed)
        
    except Exception as e:
        print_test("Gang sheet reject empty designs", False, f"Error: {str(e)}")
        results.append(False)
    
    # Test 7g: Reject invalid mode
    try:
        payload = {
            "mode": "invalid_mode",
            "canvasWidthMm": 310,
            "express": False,
            "designs": [
                {
                    "imageUrl": "/uploads/designs/test.png",
                    "name": "test.png",
                    "srcWidthPx": 1000,
                    "srcHeightPx": 1000,
                    "xMm": 10,
                    "yMm": 10,
                    "widthMm": 100,
                    "heightMm": 100,
                    "rotation": 0
                }
            ]
        }
        
        r = requests.post(f"{BASE_URL}/gang-sheets", json=payload, timeout=15)
        passed = r.status_code == 400
        
        print_test("Gang sheet reject invalid mode", passed,
                  f"Status: {r.status_code} (expected 400), Error: {r.json().get('error')}")
        results.append(passed)
        
    except Exception as e:
        print_test("Gang sheet reject invalid mode", False, f"Error: {str(e)}")
        results.append(False)
    
    return all(results)

def test_read_endpoints():
    """Test GET endpoints for products, orders, inventory"""
    print("\n" + "="*80)
    print("TEST 8: Read Endpoints")
    print("="*80)
    
    results = []
    
    # Test 8a: GET /api/products
    try:
        r = requests.get(f"{BASE_URL}/products", timeout=10)
        data = r.json()
        
        # Verify no _id field in response
        has_mongo_id = any('_id' in item for item in data)
        
        passed = (
            r.status_code == 200 and
            isinstance(data, list) and
            len(data) > 0 and
            not has_mongo_id
        )
        
        print_test("GET /api/products", passed,
                  f"Status: {r.status_code}, Count: {len(data)}, Has _id: {has_mongo_id}")
        results.append(passed)
        
    except Exception as e:
        print_test("GET /api/products", False, f"Error: {str(e)}")
        results.append(False)
    
    # Test 8b: GET /api/orders
    try:
        r = requests.get(f"{BASE_URL}/orders", timeout=10)
        data = r.json()
        
        # Verify no _id field and new orders exist
        has_mongo_id = any('_id' in item for item in data)
        has_new_order = any(item.get('orderNumber', '').startswith('DLV-2025-') for item in data)
        
        passed = (
            r.status_code == 200 and
            isinstance(data, list) and
            len(data) > 0 and
            not has_mongo_id and
            has_new_order
        )
        
        print_test("GET /api/orders", passed,
                  f"Status: {r.status_code}, Count: {len(data)}, Has _id: {has_mongo_id}, "
                  f"Has new orders: {has_new_order}")
        results.append(passed)
        
    except Exception as e:
        print_test("GET /api/orders", False, f"Error: {str(e)}")
        results.append(False)
    
    # Test 8c: GET /api/inventory/commercial
    try:
        r = requests.get(f"{BASE_URL}/inventory/commercial", timeout=10)
        data = r.json()
        
        has_mongo_id = any('_id' in item for item in data)
        
        passed = (
            r.status_code == 200 and
            isinstance(data, list) and
            len(data) > 0 and
            not has_mongo_id
        )
        
        print_test("GET /api/inventory/commercial", passed,
                  f"Status: {r.status_code}, Count: {len(data)}, Has _id: {has_mongo_id}")
        results.append(passed)
        
    except Exception as e:
        print_test("GET /api/inventory/commercial", False, f"Error: {str(e)}")
        results.append(False)
    
    # Test 8d: GET /api/inventory/supplies
    try:
        r = requests.get(f"{BASE_URL}/inventory/supplies", timeout=10)
        data = r.json()
        
        has_mongo_id = any('_id' in item for item in data)
        
        passed = (
            r.status_code == 200 and
            isinstance(data, list) and
            len(data) > 0 and
            not has_mongo_id
        )
        
        print_test("GET /api/inventory/supplies", passed,
                  f"Status: {r.status_code}, Count: {len(data)}, Has _id: {has_mongo_id}")
        results.append(passed)
        
    except Exception as e:
        print_test("GET /api/inventory/supplies", False, f"Error: {str(e)}")
        results.append(False)
    
    return all(results)

def main():
    print("\n" + "="*80)
    print("ESTAMPADOS DLV - BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    results = {
        "Health Check": test_health(),
        "Seed Endpoint": test_seed(),
        "Config Endpoint": test_config(),
        "Pricing Endpoint": test_pricing(),
        "Dashboard Summary": test_dashboard(),
        "Design Upload": test_upload(),
        "Gang Sheet Creation": test_gang_sheets(),
        "Read Endpoints": test_read_endpoints(),
    }
    
    print("\n" + "="*80)
    print("FINAL RESULTS")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    total = len(results)
    passed = sum(results.values())
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    exit(main())
