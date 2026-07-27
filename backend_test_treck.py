#!/usr/bin/env python3
"""
Backend testing for Treck (VTEX) catalog importer.
Tests all endpoints end-to-end: scan, import, sync-inventory, cron settings, refresh-prices.
"""

import requests
import time
import json
from typing import Dict, Any, Optional

# Base URL from .env
BASE_URL = "https://dtf-print-hub-2.preview.emergentagent.com/api"

# Admin credentials for authentication
ADMIN_EMAIL = "estampadosdlv@gmail.com"
ADMIN_PASSWORD = "EstampadosDLV2025!"

# Global session with cookies
session = requests.Session()
session.headers.update({"Content-Type": "application/json"})


def login() -> bool:
    """Login as admin and store cookie in session."""
    print("\n🔐 Logging in as admin...")
    resp = session.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Login successful. User: {data.get('user', {}).get('email')}, Role: {data.get('user', {}).get('role')}")
        return True
    else:
        print(f"❌ Login failed: {resp.status_code} {resp.text}")
        return False


def test_scan_small_range():
    """A1) Happy path with small range: POST /api/import/treck/scan body {"from":0,"to":9,"force":true}"""
    print("\n" + "="*80)
    print("TEST A1: SCAN endpoint - small range (0-9)")
    print("="*80)
    
    try:
        resp = session.post(
            f"{BASE_URL}/import/treck/scan",
            json={"from": 0, "to": 9, "force": True},
            timeout=60,
        )
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return None
        
        data = resp.json()
        
        # Verify response structure
        assert "scanId" in data, "Missing scanId"
        assert "products" in data, "Missing products array"
        assert "count" in data, "Missing count"
        assert "totalInCatalog" in data, "Missing totalInCatalog"
        assert "cached" in data, "Missing cached field"
        
        scan_id = data["scanId"]
        products = data["products"]
        count = data["count"]
        total_in_catalog = data["totalInCatalog"]
        cached = data["cached"]
        
        print(f"✅ Response structure valid")
        print(f"   scanId: {scan_id}")
        print(f"   count: {count}")
        print(f"   totalInCatalog: {total_in_catalog}")
        print(f"   cached: {cached}")
        print(f"   products array length: {len(products)}")
        
        # Verify we got approximately 10 products (may be less if some filtered out)
        assert len(products) >= 5, f"Expected at least 5 products, got {len(products)}"
        assert len(products) <= 10, f"Expected at most 10 products, got {len(products)}"
        
        # Verify totalInCatalog is around 448
        assert total_in_catalog >= 400, f"Expected totalInCatalog ~448, got {total_in_catalog}"
        assert total_in_catalog <= 500, f"Expected totalInCatalog ~448, got {total_in_catalog}"
        
        # Verify cached is false (force=true)
        assert cached is False, f"Expected cached=false with force=true, got {cached}"
        
        # Verify each product has required fields
        if len(products) > 0:
            p = products[0]
            required_fields = [
                "supplierProductId", "supplierBrand", "shortName", "subcategory",
                "workwearType", "priceWholesale", "finalPrice", "previewImage",
                "totalImages", "variantsCount", "colorsCount", "sizesCount",
                "hasStock", "alreadyImported"
            ]
            for field in required_fields:
                assert field in p, f"Missing field '{field}' in product"
            
            # Verify workwearType is valid
            valid_types = ["trabajo", "tecnica", "ignifuga", "outdoor", "otros"]
            assert p["workwearType"] in valid_types, f"Invalid workwearType: {p['workwearType']}"
            
            # Verify finalPrice = priceWholesale × 1.4 (rounded)
            expected_final = round(p["priceWholesale"] * 1.4)
            # Allow some rounding difference due to Chilean rounding (xx90 endings)
            diff = abs(p["finalPrice"] - expected_final)
            assert diff <= 100, f"finalPrice {p['finalPrice']} doesn't match expected ~{expected_final} (diff: {diff})"
            
            print(f"✅ Product structure valid:")
            print(f"   supplierProductId: {p['supplierProductId']}")
            print(f"   supplierBrand: {p['supplierBrand']}")
            print(f"   shortName: {p['shortName']}")
            print(f"   workwearType: {p['workwearType']}")
            print(f"   priceWholesale: ${p['priceWholesale']:,}")
            print(f"   finalPrice: ${p['finalPrice']:,}")
            print(f"   variantsCount: {p['variantsCount']}")
            print(f"   colorsCount: {p['colorsCount']}")
            print(f"   sizesCount: {p['sizesCount']}")
        
        # Verify no _id fields
        json_str = json.dumps(data)
        assert '"_id"' not in json_str, "Found MongoDB _id in response"
        
        print(f"✅ PASS: Scan small range successful")
        return scan_id
        
    except AssertionError as e:
        print(f"❌ FAIL: {e}")
        return None
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return None


def test_scan_cache(scan_id_from_previous: str):
    """A2) Cache behavior: POST /api/import/treck/scan body {"from":0,"to":9} (no force) immediately after step 1."""
    print("\n" + "="*80)
    print("TEST A2: SCAN cache behavior")
    print("="*80)
    
    try:
        resp = session.post(
            f"{BASE_URL}/import/treck/scan",
            json={"from": 0, "to": 9},  # no force
            timeout=15,
        )
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        # Verify cached is true
        assert data.get("cached") is True, f"Expected cached=true, got {data.get('cached')}"
        
        # Verify scanId matches previous
        assert data.get("scanId") == scan_id_from_previous, f"Expected same scanId, got different"
        
        print(f"✅ PASS: Cache working correctly")
        print(f"   cached: {data['cached']}")
        print(f"   scanId: {data['scanId']} (matches previous)")
        return True
        
    except AssertionError as e:
        print(f"❌ FAIL: {e}")
        return False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False


def test_scan_full():
    """A3) Full scan (SLOW - allow up to 60s): POST /api/import/treck/scan body {"full":true,"force":true}."""
    print("\n" + "="*80)
    print("TEST A3: SCAN full catalog (SLOW - may take 30-60s)")
    print("="*80)
    
    try:
        print("⏳ Scanning full catalog... (this may take 30-60 seconds)")
        start_time = time.time()
        
        resp = session.post(
            f"{BASE_URL}/import/treck/scan",
            json={"full": True, "force": True},
            timeout=90,
        )
        
        elapsed = time.time() - start_time
        print(f"⏱️  Scan completed in {elapsed:.1f}s")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return None
        
        data = resp.json()
        count = data.get("count", 0)
        total_in_catalog = data.get("totalInCatalog", 0)
        
        # Verify count matches totalInCatalog (approximately 448, may be slightly less if some filtered)
        print(f"   count: {count}")
        print(f"   totalInCatalog: {total_in_catalog}")
        
        # Allow some products to be filtered out (no price/items)
        assert count >= 400, f"Expected count ~448, got {count}"
        assert count <= total_in_catalog, f"count {count} should be <= totalInCatalog {total_in_catalog}"
        
        print(f"✅ PASS: Full scan successful")
        return data.get("scanId")
        
    except AssertionError as e:
        print(f"❌ FAIL: {e}")
        return None
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return None


def test_import_products(scan_id: str):
    """B4) Import 2 products from the scan."""
    print("\n" + "="*80)
    print("TEST B4: IMPORT endpoint - import 2 products")
    print("="*80)
    
    try:
        # First, get the scan to pick 2 product IDs
        resp = session.post(
            f"{BASE_URL}/import/treck/scan",
            json={"from": 0, "to": 9},  # use cache
            timeout=15,
        )
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Could not retrieve scan")
            return None
        
        data = resp.json()
        products = data.get("products", [])
        
        if len(products) < 2:
            print(f"❌ FAIL: Need at least 2 products in scan, got {len(products)}")
            return None
        
        # Pick first 2 products
        selected_ids = [products[0]["supplierProductId"], products[1]["supplierProductId"]]
        print(f"   Selected IDs: {selected_ids}")
        
        # Import with paraphrase=false for speed
        print("⏳ Importing 2 products (paraphrase=false for speed)...")
        start_time = time.time()
        
        resp = session.post(
            f"{BASE_URL}/import/treck/import",
            json={
                "scanId": scan_id,
                "selectedIds": selected_ids,
                "markupPercent": 40,
                "paraphrase": False,
            },
            timeout=60,
        )
        
        elapsed = time.time() - start_time
        print(f"⏱️  Import completed in {elapsed:.1f}s")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return None
        
        data = resp.json()
        
        # Verify response structure
        assert data.get("ok") is True, "Expected ok=true"
        assert data.get("attempted") == 2, f"Expected attempted=2, got {data.get('attempted')}"
        
        # First import should create 2 products (assuming no prior Treck import)
        created = data.get("created", 0)
        updated = data.get("updated", 0)
        failed = data.get("failed", 0)
        
        print(f"   ok: {data['ok']}")
        print(f"   attempted: {data['attempted']}")
        print(f"   created: {created}")
        print(f"   updated: {updated}")
        print(f"   failed: {failed}")
        
        # Verify at least some succeeded
        assert (created + updated) >= 2, f"Expected at least 2 products imported, got {created + updated}"
        assert failed == 0, f"Expected no failures, got {failed}"
        
        # Verify details array
        details = data.get("details", [])
        assert len(details) == 2, f"Expected 2 details entries, got {len(details)}"
        
        for d in details:
            assert "action" in d, "Missing action in detail"
            assert d["action"] in ["created", "updated"], f"Invalid action: {d['action']}"
            assert "productId" in d, "Missing productId in detail"
            print(f"   - {d['name']}: {d['action']} (productId: {d['productId']})")
        
        print(f"✅ PASS: Import successful")
        return selected_ids
        
    except AssertionError as e:
        print(f"❌ FAIL: {e}")
        return None
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return None


def test_import_idempotency(scan_id: str, selected_ids: list):
    """B5) Idempotency: run import again with same scanId + selectedIds."""
    print("\n" + "="*80)
    print("TEST B5: IMPORT idempotency")
    print("="*80)
    
    try:
        print("⏳ Re-importing same 2 products...")
        
        resp = session.post(
            f"{BASE_URL}/import/treck/import",
            json={
                "scanId": scan_id,
                "selectedIds": selected_ids,
                "markupPercent": 40,
                "paraphrase": False,
            },
            timeout=60,
        )
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        # Second import should update (not create)
        created = data.get("created", 0)
        updated = data.get("updated", 0)
        
        print(f"   created: {created}")
        print(f"   updated: {updated}")
        
        # Expect 0 created, 2 updated (products already exist)
        assert created == 0, f"Expected created=0 on second import, got {created}"
        assert updated == 2, f"Expected updated=2 on second import, got {updated}"
        
        print(f"✅ PASS: Idempotency working correctly")
        return True
        
    except AssertionError as e:
        print(f"❌ FAIL: {e}")
        return False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False


def test_import_validations():
    """B6) Validation errors."""
    print("\n" + "="*80)
    print("TEST B6: IMPORT validation errors")
    print("="*80)
    
    all_pass = True
    
    # Test 1: No body
    try:
        resp = session.post(f"{BASE_URL}/import/treck/import", json={}, timeout=15)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "scanId requerido" in resp.text, "Expected 'scanId requerido' error"
        print("✅ Test 1: No scanId → 400 'scanId requerido'")
    except AssertionError as e:
        print(f"❌ Test 1 FAIL: {e}")
        all_pass = False
    
    # Test 2: Non-existent scanId
    try:
        resp = session.post(
            f"{BASE_URL}/import/treck/import",
            json={"scanId": "nonexistent-uuid", "selectedIds": ["1"]},
            timeout=15,
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        assert "scan no encontrado" in resp.text.lower(), "Expected 'scan no encontrado' error"
        print("✅ Test 2: Non-existent scanId → 404 'scan no encontrado'")
    except AssertionError as e:
        print(f"❌ Test 2 FAIL: {e}")
        all_pass = False
    
    # Test 3: Empty selectedIds
    try:
        # Get a valid scanId first
        resp = session.post(f"{BASE_URL}/import/treck/scan", json={"from": 0, "to": 9}, timeout=15)
        scan_id = resp.json().get("scanId")
        
        resp = session.post(
            f"{BASE_URL}/import/treck/import",
            json={"scanId": scan_id, "selectedIds": []},
            timeout=15,
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "al menos 1 producto" in resp.text.lower(), "Expected 'al menos 1 producto' error"
        print("✅ Test 3: Empty selectedIds → 400 'Selecciona al menos 1 producto'")
    except AssertionError as e:
        print(f"❌ Test 3 FAIL: {e}")
        all_pass = False
    
    # Test 4: ID not in scan
    try:
        resp = session.post(
            f"{BASE_URL}/import/treck/import",
            json={"scanId": scan_id, "selectedIds": ["99999"]},
            timeout=15,
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "ninguno de los ids" in resp.text.lower(), "Expected 'ninguno de los IDs' error"
        print("✅ Test 4: ID not in scan → 400 'ninguno de los IDs seleccionados está en el scan'")
    except AssertionError as e:
        print(f"❌ Test 4 FAIL: {e}")
        all_pass = False
    
    if all_pass:
        print(f"✅ PASS: All validation tests passed")
    else:
        print(f"❌ FAIL: Some validation tests failed")
    
    return all_pass


def test_get_imported():
    """C7) GET /api/import/treck/imported"""
    print("\n" + "="*80)
    print("TEST C7: GET imported products")
    print("="*80)
    
    try:
        resp = session.get(f"{BASE_URL}/import/treck/imported", timeout=15)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        # Should be an array
        assert isinstance(data, list), f"Expected array, got {type(data)}"
        
        # Should have at least 2 products (from previous import)
        assert len(data) >= 2, f"Expected at least 2 products, got {len(data)}"
        
        print(f"   Found {len(data)} imported products")
        
        # Verify structure of first product
        if len(data) > 0:
            p = data[0]
            required_fields = [
                "id", "name", "slug", "category", "subcategory", "workwearType",
                "supplierBrand", "supplierProductId", "supplierPrice", "basePrice",
                "markupPercent", "lastSyncedAt", "active", "images"
            ]
            for field in required_fields:
                assert field in p, f"Missing field '{field}' in product"
            
            # Verify no _id field
            assert "_id" not in p, "Found MongoDB _id in response"
            
            print(f"✅ Product structure valid:")
            print(f"   id: {p['id']}")
            print(f"   name: {p['name']}")
            print(f"   category: {p['category']}")
            print(f"   subcategory: {p['subcategory']}")
            print(f"   workwearType: {p['workwearType']}")
            print(f"   supplierBrand: {p['supplierBrand']}")
            print(f"   supplierPrice: ${p['supplierPrice']:,}")
            print(f"   basePrice: ${p['basePrice']:,}")
            print(f"   markupPercent: {p['markupPercent']}%")
        
        print(f"✅ PASS: GET imported successful")
        return True
        
    except AssertionError as e:
        print(f"❌ FAIL: {e}")
        return False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False


def test_get_history():
    """C8) GET /api/import/treck/history"""
    print("\n" + "="*80)
    print("TEST C8: GET import history")
    print("="*80)
    
    try:
        resp = session.get(f"{BASE_URL}/import/treck/history", timeout=15)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        # Should be an array
        assert isinstance(data, list), f"Expected array, got {type(data)}"
        
        # Should have at least 2 entries (from previous imports)
        assert len(data) >= 2, f"Expected at least 2 history entries, got {len(data)}"
        
        print(f"   Found {len(data)} history entries")
        
        # Verify structure of first entry
        if len(data) > 0:
            h = data[0]
            required_fields = ["id", "scanId", "markupPercent", "paraphrase", "stats", "createdAt"]
            for field in required_fields:
                assert field in h, f"Missing field '{field}' in history entry"
            
            # Verify no _id field
            assert "_id" not in h, "Found MongoDB _id in response"
            
            print(f"✅ History entry structure valid:")
            print(f"   id: {h['id']}")
            print(f"   scanId: {h['scanId']}")
            print(f"   markupPercent: {h['markupPercent']}%")
            print(f"   paraphrase: {h['paraphrase']}")
            print(f"   stats: {h['stats']}")
            print(f"   createdAt: {h['createdAt']}")
        
        print(f"✅ PASS: GET history successful")
        return True
        
    except AssertionError as e:
        print(f"❌ FAIL: {e}")
        return False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False


def test_sync_inventory():
    """D9) POST /api/import/treck/sync-inventory"""
    print("\n" + "="*80)
    print("TEST D9: Sync inventory")
    print("="*80)
    
    try:
        print("⏳ Syncing inventory...")
        
        resp = session.post(f"{BASE_URL}/import/treck/sync-inventory", json={}, timeout=30)
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        
        # Verify response structure
        assert data.get("ok") is True, "Expected ok=true"
        assert "productsProcessed" in data, "Missing productsProcessed"
        assert "stockRecordsCreated" in data, "Missing stockRecordsCreated"
        assert "stockRecordsUpdated" in data, "Missing stockRecordsUpdated"
        
        products_processed = data["productsProcessed"]
        stock_created = data["stockRecordsCreated"]
        stock_updated = data["stockRecordsUpdated"]
        
        print(f"   ok: {data['ok']}")
        print(f"   productsProcessed: {products_processed}")
        print(f"   stockRecordsCreated: {stock_created}")
        print(f"   stockRecordsUpdated: {stock_updated}")
        
        # Should have processed at least 2 products
        assert products_processed >= 2, f"Expected at least 2 products processed, got {products_processed}"
        
        # First run should create stock records (or update if already exist)
        # Number of stock records = number of variants across all products (usually 5-7 per product)
        total_stock = stock_created + stock_updated
        assert total_stock >= products_processed, f"Expected at least {products_processed} stock records, got {total_stock}"
        
        print(f"✅ PASS: Sync inventory successful")
        
        # Verify in commercial_stock via GET /api/inventory/commercial
        print("\n   Verifying stock records in inventory...")
        resp = session.get(f"{BASE_URL}/inventory/commercial", timeout=15)
        if resp.status_code == 200:
            inventory = resp.json()
            treck_stock = [s for s in inventory if s.get("supplier") == "treck"]
            print(f"   Found {len(treck_stock)} Treck stock records in inventory")
            
            if len(treck_stock) > 0:
                s = treck_stock[0]
                print(f"   Sample stock record:")
                print(f"     location: {s.get('location')}")
                print(f"     quantity: {s.get('quantity')}")
                print(f"     onDemand: {s.get('onDemand')}")
                print(f"     supplier: {s.get('supplier')}")
                
                # Verify location label
                assert "Treck" in s.get("location", ""), "Expected 'Treck' in location label"
        
        return True
        
    except AssertionError as e:
        print(f"❌ FAIL: {e}")
        return False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False


def test_cron_settings():
    """E10-11) GET/POST /api/import/treck/cron/settings and precheck"""
    print("\n" + "="*80)
    print("TEST E10-11: Cron settings and toggle")
    print("="*80)
    
    all_pass = True
    
    # Test 10: GET settings
    try:
        resp = session.get(f"{BASE_URL}/import/treck/cron/settings", timeout=15)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert "enabled" in data, "Missing enabled field"
        assert "schedule" in data, "Missing schedule field"
        assert "humanSchedule" in data, "Missing humanSchedule field"
        
        # Default should be enabled=true
        assert data["enabled"] is True, f"Expected enabled=true by default, got {data['enabled']}"
        assert data["schedule"] == "45 3 * * *", f"Expected schedule '45 3 * * *', got {data['schedule']}"
        assert "00:45" in data["humanSchedule"], f"Expected '00:45' in humanSchedule, got {data['humanSchedule']}"
        
        print(f"✅ Test 10: GET cron settings successful")
        print(f"   enabled: {data['enabled']}")
        print(f"   schedule: {data['schedule']}")
        print(f"   humanSchedule: {data['humanSchedule']}")
        print(f"   lastRunAt: {data.get('lastRunAt')}")
    except AssertionError as e:
        print(f"❌ Test 10 FAIL: {e}")
        all_pass = False
    
    # Test 11a: Toggle off
    try:
        resp = session.post(
            f"{BASE_URL}/import/treck/cron/settings",
            json={"enabled": False},
            timeout=15,
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert data.get("ok") is True, "Expected ok=true"
        assert data.get("enabled") is False, f"Expected enabled=false, got {data.get('enabled')}"
        
        print(f"✅ Test 11a: Toggle off successful")
    except AssertionError as e:
        print(f"❌ Test 11a FAIL: {e}")
        all_pass = False
    
    # Test 11b: Verify GET shows disabled
    try:
        resp = session.get(f"{BASE_URL}/import/treck/cron/settings", timeout=15)
        data = resp.json()
        assert data.get("enabled") is False, f"Expected enabled=false after toggle, got {data.get('enabled')}"
        
        print(f"✅ Test 11b: GET shows enabled=false")
    except AssertionError as e:
        print(f"❌ Test 11b FAIL: {e}")
        all_pass = False
    
    # Test 11c: Verify precheck shows runNow=false
    try:
        resp = session.get(f"{BASE_URL}/import/treck/cron/precheck", timeout=15)
        data = resp.json()
        assert data.get("runNow") is False, f"Expected runNow=false, got {data.get('runNow')}"
        assert data.get("enabled") is False, f"Expected enabled=false, got {data.get('enabled')}"
        assert data.get("reason") == "disabled_by_user", f"Expected reason='disabled_by_user', got {data.get('reason')}"
        
        print(f"✅ Test 11c: Precheck shows runNow=false, reason='disabled_by_user'")
    except AssertionError as e:
        print(f"❌ Test 11c FAIL: {e}")
        all_pass = False
    
    # Test 11d: Toggle back on
    try:
        resp = session.post(
            f"{BASE_URL}/import/treck/cron/settings",
            json={"enabled": True},
            timeout=15,
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert data.get("enabled") is True, f"Expected enabled=true, got {data.get('enabled')}"
        
        print(f"✅ Test 11d: Toggle back on successful")
    except AssertionError as e:
        print(f"❌ Test 11d FAIL: {e}")
        all_pass = False
    
    # Test 11e: Verify precheck shows runNow=true
    try:
        resp = session.get(f"{BASE_URL}/import/treck/cron/precheck", timeout=15)
        data = resp.json()
        assert data.get("runNow") is True, f"Expected runNow=true, got {data.get('runNow')}"
        
        print(f"✅ Test 11e: Precheck shows runNow=true")
    except AssertionError as e:
        print(f"❌ Test 11e FAIL: {e}")
        all_pass = False
    
    if all_pass:
        print(f"✅ PASS: All cron settings tests passed")
    else:
        print(f"❌ FAIL: Some cron settings tests failed")
    
    return all_pass


def test_refresh_prices():
    """F12) POST /api/import/treck/refresh-prices"""
    print("\n" + "="*80)
    print("TEST F12: Refresh prices")
    print("="*80)
    
    try:
        print("⏳ Refreshing prices (may take 10-20s)...")
        start_time = time.time()
        
        resp = session.post(f"{BASE_URL}/import/treck/refresh-prices", json={}, timeout=60)
        
        elapsed = time.time() - start_time
        print(f"⏱️  Refresh completed in {elapsed:.1f}s")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        
        # Verify response structure
        assert data.get("ok") is True, "Expected ok=true"
        assert "updated" in data, "Missing updated field"
        assert "unchanged" in data, "Missing unchanged field"
        assert "failed" in data, "Missing failed field"
        
        updated = data["updated"]
        unchanged = data["unchanged"]
        failed = data["failed"]
        
        print(f"   ok: {data['ok']}")
        print(f"   updated: {updated}")
        print(f"   unchanged: {unchanged}")
        print(f"   failed: {failed}")
        
        # Total should equal number of imported products (at least 2)
        total = updated + unchanged + failed
        assert total >= 2, f"Expected at least 2 products processed, got {total}"
        
        # Since we just imported them, likely unchanged=2, updated=0
        # (unless VTEX changed prices between import and refresh)
        print(f"   Total processed: {total}")
        
        # Verify history was logged
        print("\n   Verifying history entry...")
        resp = session.get(f"{BASE_URL}/import/treck/history", timeout=15)
        if resp.status_code == 200:
            history = resp.json()
            # Should have at least 3 entries now (2 imports + 1 refresh)
            assert len(history) >= 3, f"Expected at least 3 history entries, got {len(history)}"
            
            # First entry should be type='refresh_prices'
            latest = history[0]
            if "type" in latest:
                assert latest["type"] == "refresh_prices", f"Expected type='refresh_prices', got {latest.get('type')}"
                print(f"   ✅ History entry created with type='refresh_prices'")
        
        print(f"✅ PASS: Refresh prices successful")
        return True
        
    except AssertionError as e:
        print(f"❌ FAIL: {e}")
        return False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False


def test_regression():
    """G13-16) Regression tests - verify other suppliers still work"""
    print("\n" + "="*80)
    print("TEST G13-16: Regression tests")
    print("="*80)
    
    all_pass = True
    
    # Test 13: GET /api/import/cottonext/imported
    try:
        resp = session.get(f"{BASE_URL}/import/cottonext/imported", timeout=15)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert isinstance(data, list), f"Expected array, got {type(data)}"
        print(f"✅ Test 13: GET /api/import/cottonext/imported → 200 ({len(data)} products)")
    except AssertionError as e:
        print(f"❌ Test 13 FAIL: {e}")
        all_pass = False
    
    # Test 14: GET /api/import/textilryu/imported
    try:
        resp = session.get(f"{BASE_URL}/import/textilryu/imported", timeout=15)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert isinstance(data, list), f"Expected array, got {type(data)}"
        print(f"✅ Test 14: GET /api/import/textilryu/imported → 200 ({len(data)} products)")
    except AssertionError as e:
        print(f"❌ Test 14 FAIL: {e}")
        all_pass = False
    
    # Test 15: GET /api/import/cottonext/cron/settings
    try:
        resp = session.get(f"{BASE_URL}/import/cottonext/cron/settings", timeout=15)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "enabled" in data, "Missing enabled field"
        assert "schedule" in data, "Missing schedule field"
        print(f"✅ Test 15: GET /api/import/cottonext/cron/settings → 200")
    except AssertionError as e:
        print(f"❌ Test 15 FAIL: {e}")
        all_pass = False
    
    # Test 16: GET /api/products (should include Treck products)
    try:
        resp = session.get(f"{BASE_URL}/products", timeout=15)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert isinstance(data, list), f"Expected array, got {type(data)}"
        
        # Find Treck products
        treck_products = [p for p in data if p.get("supplier") == "treck"]
        assert len(treck_products) >= 2, f"Expected at least 2 Treck products, got {len(treck_products)}"
        
        # Verify they have category="workwear"
        for p in treck_products:
            assert p.get("category") == "workwear", f"Expected category='workwear', got {p.get('category')}"
        
        print(f"✅ Test 16: GET /api/products → 200 ({len(data)} total, {len(treck_products)} Treck products with category='workwear')")
    except AssertionError as e:
        print(f"❌ Test 16 FAIL: {e}")
        all_pass = False
    
    if all_pass:
        print(f"✅ PASS: All regression tests passed")
    else:
        print(f"❌ FAIL: Some regression tests failed")
    
    return all_pass


def cleanup():
    """Cleanup: Delete test products from DB"""
    print("\n" + "="*80)
    print("CLEANUP: Deleting test products")
    print("="*80)
    
    try:
        # Note: We don't have a direct DELETE endpoint, so we'll just report what should be cleaned
        print("⚠️  Manual cleanup required:")
        print("   Run these MongoDB commands:")
        print("   db.products.deleteMany({supplier: 'treck'})")
        print("   db.commercial_stock.deleteMany({supplier: 'treck'})")
        print("   db.treck_scans.deleteMany({})")
        print("   db.treck_imports.deleteMany({})")
        print("")
        print("   Or verify GET /api/import/treck/imported returns [] after cleanup")
        
        return True
        
    except Exception as e:
        print(f"❌ Cleanup failed: {e}")
        return False


def main():
    """Run all tests in sequence."""
    print("\n" + "="*80)
    print("TRECK (VTEX) CATALOG IMPORTER - BACKEND TESTING")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin: {ADMIN_EMAIL}")
    print("="*80)
    
    # Login first
    if not login():
        print("\n❌ FATAL: Login failed. Cannot proceed with tests.")
        return
    
    # Track results
    results = {}
    
    # A) SCAN endpoint
    scan_id = test_scan_small_range()
    results["A1_scan_small_range"] = scan_id is not None
    
    if scan_id:
        results["A2_scan_cache"] = test_scan_cache(scan_id)
    else:
        results["A2_scan_cache"] = False
        print("⚠️  Skipping A2 (scan cache) due to A1 failure")
    
    full_scan_id = test_scan_full()
    results["A3_scan_full"] = full_scan_id is not None
    
    # B) IMPORT endpoint
    if scan_id:
        selected_ids = test_import_products(scan_id)
        results["B4_import_products"] = selected_ids is not None
        
        if selected_ids:
            results["B5_import_idempotency"] = test_import_idempotency(scan_id, selected_ids)
        else:
            results["B5_import_idempotency"] = False
            print("⚠️  Skipping B5 (idempotency) due to B4 failure")
    else:
        results["B4_import_products"] = False
        results["B5_import_idempotency"] = False
        print("⚠️  Skipping B4-B5 (import) due to A1 failure")
    
    results["B6_import_validations"] = test_import_validations()
    
    # C) GET endpoints
    results["C7_get_imported"] = test_get_imported()
    results["C8_get_history"] = test_get_history()
    
    # D) Sync inventory
    results["D9_sync_inventory"] = test_sync_inventory()
    
    # E) Cron settings
    results["E10_11_cron_settings"] = test_cron_settings()
    
    # F) Refresh prices
    results["F12_refresh_prices"] = test_refresh_prices()
    
    # G) Regression
    results["G13_16_regression"] = test_regression()
    
    # Cleanup
    cleanup()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, passed_flag in results.items():
        status = "✅ PASS" if passed_flag else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Treck importer is working correctly.")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Review the output above for details.")


if __name__ == "__main__":
    main()
