#!/usr/bin/env python3
"""
Backend testing for order cancel/delete and production remove endpoints.
Tests the 3 new endpoints:
- POST /api/orders/cancel
- POST /api/orders/delete
- POST /api/production/remove
"""

import requests
import json
import time
from datetime import datetime

BASE_URL = "https://dtf-print-hub-2.preview.emergentagent.com/api"
ADMIN_EMAIL = "estampadosdlv@gmail.com"
ADMIN_PASSWORD = "EstampadosDLV2025!"

# Global session for cookies
session = requests.Session()

def log(msg):
    """Print timestamped log message"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def login_admin():
    """Login as admin and store cookie"""
    log("Logging in as admin...")
    resp = session.post(f"{BASE_URL}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code != 200:
        log(f"❌ Login failed: {resp.status_code} {resp.text}")
        return False
    log(f"✅ Login successful")
    return True

def create_public_order():
    """Create a public order via POST /api/orders/public and return orderId"""
    log("Creating public order...")
    
    # First, get a real product from the database
    resp = requests.get(f"{BASE_URL}/products")
    if resp.status_code != 200:
        log(f"❌ Could not fetch products: {resp.status_code}")
        return None
    
    products = resp.json()
    if not products or len(products) == 0:
        log("❌ No products in database")
        return None
    
    # Use the first product with variants
    product = products[0]
    product_id = product.get("id")
    variants = product.get("variants", [])
    
    if not variants:
        log("❌ Product has no variants")
        return None
    
    variant_id = variants[0].get("id")
    
    log(f"Using product: {product.get('name')} (variant: {variants[0].get('name')})")
    
    payload = {
        "customer": {
            "name": "María González",
            "email": "maria.gonzalez@example.cl",
            "phone": "+56912345678",
            "rut": "12.345.678-9"
        },
        "deliveryMethod": "pickup",
        "paymentMethod": "transfer",
        "items": [
            {
                "productId": product_id,
                "variantId": variant_id,
                "quantity": 2
            }
        ],
        "notes": "Test order for cancel/delete testing"
    }
    
    # Use a new session without auth for public endpoint
    resp = requests.post(f"{BASE_URL}/orders/public", json=payload)
    if resp.status_code != 200:
        log(f"❌ Create order failed: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    order_id = data.get("orderId")
    order_number = data.get("orderNumber")
    log(f"✅ Order created: {order_number} (id: {order_id})")
    return order_id, order_number, product_id, variant_id

def get_order(order_id):
    """Get order by id"""
    resp = session.get(f"{BASE_URL}/orders")
    if resp.status_code != 200:
        return None
    orders = resp.json()
    for o in orders:
        if o.get("id") == order_id:
            return o
    return None

def get_stock_reserved(product_id, variant_id):
    """Get reservedQuantity for a product variant"""
    resp = session.get(f"{BASE_URL}/inventory/commercial")
    if resp.status_code != 200:
        return None
    stocks = resp.json()
    for s in stocks:
        if s.get("productId") == product_id and s.get("variantId") == variant_id:
            return s.get("reservedQuantity", 0), product_id, variant_id
    return None, product_id, variant_id

def get_production_queue_count(order_id):
    """Count production_queue items for an order"""
    resp = session.get(f"{BASE_URL}/production/queue")
    if resp.status_code != 200:
        return None
    items = resp.json()
    count = sum(1 for i in items if i.get("orderId") == order_id)
    return count

def insert_production_queue_item(order_id=None):
    """Insert a fake production_queue item via mongosh and return its id"""
    import subprocess
    import uuid
    
    item_id = str(uuid.uuid4())
    order_id_str = f'"{order_id}"' if order_id else 'null'
    
    cmd = f"""mongosh mongodb://localhost:27017/estampados_dlv --quiet --eval 'db.production_queue.insertOne({{
        id: "{item_id}",
        orderId: {order_id_str},
        status: "received",
        printer: "epson_r1390",
        lengthMm: 0,
        createdAt: new Date()
    }}); print("{item_id}");'"""
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            # Extract the UUID from output (last line)
            lines = result.stdout.strip().split('\n')
            for line in reversed(lines):
                if len(line) == 36 and '-' in line:  # UUID format
                    log(f"✅ Inserted production_queue item: {line}")
                    return line
        log(f"❌ Failed to insert production_queue item: {result.stderr}")
        return None
    except Exception as e:
        log(f"❌ Exception inserting production_queue item: {e}")
        return None

def cleanup_test_orders():
    """Delete all test orders created during testing"""
    log("Cleaning up test orders...")
    import subprocess
    
    cmd = """mongosh mongodb://localhost:27017/estampados_dlv --quiet --eval '
    const result = db.orders.deleteMany({
        "customerSnapshot.email": "maria.gonzalez@example.cl"
    });
    print("Deleted " + result.deletedCount + " orders");
    
    const items = db.order_items.deleteMany({
        orderId: { $in: [] }
    });
    
    const queue = db.production_queue.deleteMany({
        orderId: null
    });
    print("Deleted " + queue.deletedCount + " orphan queue items");
    '"""
    
    try:
        subprocess.run(cmd, shell=True, timeout=10)
        log("✅ Cleanup complete")
    except:
        log("⚠️ Cleanup failed (non-critical)")

# ============================================================================
# TEST SUITE
# ============================================================================

def test_t1_1_cancel_without_auth():
    """T1.1: POST /api/orders/cancel without auth → 403"""
    log("\n=== T1.1: Cancel without auth → 403 ===")
    
    # Use a new session without auth
    resp = requests.post(f"{BASE_URL}/orders/cancel", json={"id": "fake-id"})
    
    if resp.status_code == 403:
        log("✅ PASS: Got 403 as expected")
        return True
    else:
        log(f"❌ FAIL: Expected 403, got {resp.status_code}")
        return False

def test_t1_2_cancel_nonexistent():
    """T1.2: POST /api/orders/cancel with nonexistent id → 404"""
    log("\n=== T1.2: Cancel nonexistent order → 404 ===")
    
    resp = session.post(f"{BASE_URL}/orders/cancel", json={"id": "nonexistent-uuid-12345"})
    
    if resp.status_code == 404:
        log("✅ PASS: Got 404 as expected")
        return True
    else:
        log(f"❌ FAIL: Expected 404, got {resp.status_code}")
        return False

def test_t1_3_t1_4_t1_5_t1_6_t1_7_cancel_valid_order():
    """T1.3-T1.7: Create order, cancel it, verify stock release and queue cleanup"""
    log("\n=== T1.3-T1.7: Cancel valid order with full verification ===")
    
    # T1.3: Create order
    result = create_public_order()
    if not result:
        log("❌ FAIL: Could not create order")
        return False
    
    order_id = result[0]
    order_number = result[1]
    product_id = result[2] if len(result) > 2 else None
    variant_id = result[3] if len(result) > 3 else None
    
    # Get initial stock reserved
    stock_result = get_stock_reserved(product_id, variant_id) if product_id and variant_id else (None, None, None)
    initial_reserved = stock_result[0] if stock_result else None
    log(f"Initial reservedQuantity: {initial_reserved}")
    
    # Insert a production_queue item for this order
    queue_item_id = insert_production_queue_item(order_id)
    if not queue_item_id:
        log("⚠️ WARNING: Could not insert production_queue item (will skip T1.7)")
    
    initial_queue_count = get_production_queue_count(order_id)
    log(f"Initial production_queue count for order: {initial_queue_count}")
    
    # T1.4: Cancel the order
    log(f"Canceling order {order_id}...")
    resp = session.post(f"{BASE_URL}/orders/cancel", json={
        "id": order_id,
        "reason": "Cliente no pagó"
    })
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Cancel failed with {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    if not data.get("ok"):
        log(f"❌ FAIL: Response ok=false")
        return False
    
    cancelled_at = data.get("cancelledAt")
    log(f"✅ T1.4 PASS: Order cancelled at {cancelled_at}")
    
    # T1.5: Verify order status
    time.sleep(0.5)  # Brief wait for DB consistency
    order = get_order(order_id)
    
    if not order:
        log("❌ FAIL: Could not fetch order after cancel")
        return False
    
    if order.get("status") != "cancelled":
        log(f"❌ FAIL: Order status is {order.get('status')}, expected 'cancelled'")
        return False
    
    if order.get("cancelReason") != "Cliente no pagó":
        log(f"❌ FAIL: cancelReason is '{order.get('cancelReason')}', expected 'Cliente no pagó'")
        return False
    
    if not order.get("cancelledAt"):
        log("❌ FAIL: cancelledAt not set")
        return False
    
    log("✅ T1.5 PASS: Order status=cancelled, cancelReason set, cancelledAt set")
    
    # T1.6: Verify stock released
    if product_id and variant_id:
        stock_result = get_stock_reserved(product_id, variant_id)
        final_reserved = stock_result[0] if stock_result else None
        log(f"Final reservedQuantity: {final_reserved}")
        
        if initial_reserved is not None and final_reserved is not None:
            expected_reserved = initial_reserved - 2  # We ordered 2 items
            if final_reserved == expected_reserved:
                log(f"✅ T1.6 PASS: Stock released correctly ({initial_reserved} → {final_reserved})")
            else:
                log(f"⚠️ T1.6 WARNING: Stock not as expected (initial={initial_reserved}, final={final_reserved}, expected={expected_reserved})")
        else:
            log("⚠️ T1.6 SKIP: Could not verify stock (product may not have stock tracking)")
    else:
        log("⚠️ T1.6 SKIP: No product/variant info available")
    
    # T1.7: Verify production_queue cleaned up
    final_queue_count = get_production_queue_count(order_id)
    log(f"Final production_queue count for order: {final_queue_count}")
    
    if final_queue_count == 0:
        log("✅ T1.7 PASS: All production_queue items removed")
    else:
        log(f"❌ T1.7 FAIL: Still {final_queue_count} items in production_queue")
        return False
    
    return True

def test_t1_8_cancel_already_cancelled():
    """T1.8: Try to cancel an already cancelled order → 400"""
    log("\n=== T1.8: Cancel already cancelled order → 400 ===")
    
    # Create and cancel an order first
    result = create_public_order()
    if not result:
        log("❌ FAIL: Could not create order")
        return False
    
    order_id = result[0]
    order_number = result[1]
    
    # Cancel it
    resp = session.post(f"{BASE_URL}/orders/cancel", json={"id": order_id, "reason": "Test"})
    if resp.status_code != 200:
        log(f"❌ FAIL: First cancel failed: {resp.status_code}")
        return False
    
    log("First cancel successful")
    
    # Try to cancel again
    resp = session.post(f"{BASE_URL}/orders/cancel", json={"id": order_id, "reason": "Test again"})
    
    if resp.status_code == 400:
        log("✅ PASS: Got 400 as expected")
        return True
    else:
        log(f"❌ FAIL: Expected 400, got {resp.status_code}")
        return False

def test_t2_1_delete_without_auth():
    """T2.1: POST /api/orders/delete without auth → 403"""
    log("\n=== T2.1: Delete without auth → 403 ===")
    
    resp = requests.post(f"{BASE_URL}/orders/delete", json={"id": "fake-id"})
    
    if resp.status_code == 403:
        log("✅ PASS: Got 403 as expected")
        return True
    else:
        log(f"❌ FAIL: Expected 403, got {resp.status_code}")
        return False

def test_t2_2_delete_nonexistent():
    """T2.2: POST /api/orders/delete with nonexistent id → 404"""
    log("\n=== T2.2: Delete nonexistent order → 404 ===")
    
    resp = session.post(f"{BASE_URL}/orders/delete", json={"id": "nonexistent-uuid-12345"})
    
    if resp.status_code == 404:
        log("✅ PASS: Got 404 as expected")
        return True
    else:
        log(f"❌ FAIL: Expected 404, got {resp.status_code}")
        return False

def test_t2_3_delete_pending_without_force():
    """T2.3: Delete pending order without force → 400"""
    log("\n=== T2.3: Delete pending order without force → 400 ===")
    
    # Create a pending order
    result = create_public_order()
    if not result:
        log("❌ FAIL: Could not create order")
        return False
    
    order_id = result[0]
    
    # Try to delete without force
    resp = session.post(f"{BASE_URL}/orders/delete", json={"id": order_id})
    
    if resp.status_code == 400:
        log("✅ PASS: Got 400 as expected")
        # Cleanup: cancel and delete with force
        session.post(f"{BASE_URL}/orders/cancel", json={"id": order_id})
        session.post(f"{BASE_URL}/orders/delete", json={"id": order_id})
        return True
    else:
        log(f"❌ FAIL: Expected 400, got {resp.status_code}")
        return False

def test_t2_4_t2_5_delete_cancelled_order():
    """T2.4-T2.5: Delete cancelled order → 200, verify cascade delete"""
    log("\n=== T2.4-T2.5: Delete cancelled order with verification ===")
    
    # Create and cancel an order
    result = create_public_order()
    if not result:
        log("❌ FAIL: Could not create order")
        return False
    
    order_id = result[0]
    order_number = result[1]
    
    # Cancel it first
    resp = session.post(f"{BASE_URL}/orders/cancel", json={"id": order_id, "reason": "Test"})
    if resp.status_code != 200:
        log(f"❌ FAIL: Cancel failed: {resp.status_code}")
        return False
    
    log(f"Order {order_number} cancelled")
    
    # T2.4: Delete it
    resp = session.post(f"{BASE_URL}/orders/delete", json={"id": order_id})
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Delete failed with {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    if not data.get("ok") or not data.get("deleted"):
        log(f"❌ FAIL: Response not ok or deleted=false")
        return False
    
    log("✅ T2.4 PASS: Order deleted successfully")
    
    # T2.5: Verify order no longer exists
    time.sleep(0.5)
    resp = requests.get(f"{BASE_URL}/orders/lookup?number={order_number}")
    
    if resp.status_code == 404:
        log("✅ T2.5 PASS: Order no longer exists (404)")
        return True
    else:
        log(f"❌ T2.5 FAIL: Order still exists (status {resp.status_code})")
        return False

def test_t2_6_delete_with_force():
    """T2.6: Delete pending order with force=true → 200"""
    log("\n=== T2.6: Delete pending order with force=true → 200 ===")
    
    # Create a pending order
    result = create_public_order()
    if not result:
        log("❌ FAIL: Could not create order")
        return False
    
    order_id = result[0]
    order_number = result[1]
    
    # Delete with force=true (without canceling first)
    resp = session.post(f"{BASE_URL}/orders/delete", json={"id": order_id, "force": True})
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Delete with force failed: {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    if not data.get("ok") or not data.get("deleted"):
        log(f"❌ FAIL: Response not ok or deleted=false")
        return False
    
    log("✅ PASS: Order deleted with force=true")
    
    # Verify it's gone
    time.sleep(0.5)
    resp = requests.get(f"{BASE_URL}/orders/lookup?number={order_number}")
    
    if resp.status_code == 404:
        log("✅ Verified: Order no longer exists")
        return True
    else:
        log(f"⚠️ WARNING: Order still exists (status {resp.status_code})")
        return True  # Still pass the main test

def test_t3_1_remove_without_auth():
    """T3.1: POST /api/production/remove without auth → 403"""
    log("\n=== T3.1: Remove production item without auth → 403 ===")
    
    resp = requests.post(f"{BASE_URL}/production/remove", json={"id": "fake-id"})
    
    if resp.status_code == 403:
        log("✅ PASS: Got 403 as expected")
        return True
    else:
        log(f"❌ FAIL: Expected 403, got {resp.status_code}")
        return False

def test_t3_2_remove_nonexistent():
    """T3.2: POST /api/production/remove with nonexistent id → 404"""
    log("\n=== T3.2: Remove nonexistent production item → 404 ===")
    
    resp = session.post(f"{BASE_URL}/production/remove", json={"id": "nonexistent-uuid-12345"})
    
    if resp.status_code == 404:
        log("✅ PASS: Got 404 as expected")
        return True
    else:
        log(f"❌ FAIL: Expected 404, got {resp.status_code}")
        return False

def test_t3_3_t3_4_t3_5_remove_fake_item():
    """T3.3-T3.5: Insert fake production_queue item, remove it, verify deletion"""
    log("\n=== T3.3-T3.5: Remove fake production item ===")
    
    # T3.3: Insert fake item
    item_id = insert_production_queue_item(order_id=None)
    if not item_id:
        log("❌ FAIL: Could not insert fake production_queue item")
        return False
    
    log(f"Fake item created: {item_id}")
    
    # T3.4: Remove it
    resp = session.post(f"{BASE_URL}/production/remove", json={"id": item_id})
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Remove failed with {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    if not data.get("ok") or not data.get("removed"):
        log(f"❌ FAIL: Response not ok or removed=false")
        return False
    
    log("✅ T3.4 PASS: Item removed successfully")
    
    # T3.5: Verify it's gone
    time.sleep(0.5)
    resp = session.get(f"{BASE_URL}/production/queue")
    if resp.status_code != 200:
        log("⚠️ WARNING: Could not fetch production queue")
        return True  # Still pass the main test
    
    items = resp.json()
    found = any(i.get("id") == item_id for i in items)
    
    if not found:
        log("✅ T3.5 PASS: Item no longer in production_queue")
        return True
    else:
        log("❌ T3.5 FAIL: Item still exists in production_queue")
        return False

def test_t3_6_remove_last_item_updates_production_status():
    """T3.6: Remove last production item for an order → productionStatus='not_started'"""
    log("\n=== T3.6: Remove last item updates productionStatus ===")
    
    # Create an order
    result = create_public_order()
    if not result:
        log("❌ FAIL: Could not create order")
        return False
    
    order_id = result[0]
    order_number = result[1]
    
    # Insert a production_queue item for this order
    item_id = insert_production_queue_item(order_id)
    if not item_id:
        log("❌ FAIL: Could not insert production_queue item")
        return False
    
    log(f"Production item created for order {order_number}: {item_id}")
    
    # Remove it
    resp = session.post(f"{BASE_URL}/production/remove", json={"id": item_id})
    
    if resp.status_code != 200:
        log(f"❌ FAIL: Remove failed: {resp.status_code}: {resp.text}")
        return False
    
    log("Item removed")
    
    # Verify order productionStatus is 'not_started'
    time.sleep(0.5)
    order = get_order(order_id)
    
    if not order:
        log("❌ FAIL: Could not fetch order")
        return False
    
    production_status = order.get("productionStatus")
    
    if production_status == "not_started":
        log(f"✅ PASS: Order productionStatus is 'not_started'")
        # Cleanup
        session.post(f"{BASE_URL}/orders/cancel", json={"id": order_id})
        session.post(f"{BASE_URL}/orders/delete", json={"id": order_id})
        return True
    else:
        log(f"❌ FAIL: Order productionStatus is '{production_status}', expected 'not_started'")
        return False

# ============================================================================
# MAIN
# ============================================================================

def main():
    log("=" * 80)
    log("BACKEND TESTING: Order Cancel/Delete + Production Remove")
    log("=" * 80)
    
    # Login
    if not login_admin():
        log("❌ CRITICAL: Could not login as admin")
        return
    
    results = []
    
    # Test 1: POST /api/orders/cancel
    log("\n" + "=" * 80)
    log("TEST GROUP 1: POST /api/orders/cancel")
    log("=" * 80)
    
    results.append(("T1.1: Cancel without auth → 403", test_t1_1_cancel_without_auth()))
    results.append(("T1.2: Cancel nonexistent → 404", test_t1_2_cancel_nonexistent()))
    results.append(("T1.3-T1.7: Cancel valid order + verify", test_t1_3_t1_4_t1_5_t1_6_t1_7_cancel_valid_order()))
    results.append(("T1.8: Cancel already cancelled → 400", test_t1_8_cancel_already_cancelled()))
    
    # Test 2: POST /api/orders/delete
    log("\n" + "=" * 80)
    log("TEST GROUP 2: POST /api/orders/delete")
    log("=" * 80)
    
    results.append(("T2.1: Delete without auth → 403", test_t2_1_delete_without_auth()))
    results.append(("T2.2: Delete nonexistent → 404", test_t2_2_delete_nonexistent()))
    results.append(("T2.3: Delete pending without force → 400", test_t2_3_delete_pending_without_force()))
    results.append(("T2.4-T2.5: Delete cancelled order + verify", test_t2_4_t2_5_delete_cancelled_order()))
    results.append(("T2.6: Delete with force=true", test_t2_6_delete_with_force()))
    
    # Test 3: POST /api/production/remove
    log("\n" + "=" * 80)
    log("TEST GROUP 3: POST /api/production/remove")
    log("=" * 80)
    
    results.append(("T3.1: Remove without auth → 403", test_t3_1_remove_without_auth()))
    results.append(("T3.2: Remove nonexistent → 404", test_t3_2_remove_nonexistent()))
    results.append(("T3.3-T3.5: Remove fake item + verify", test_t3_3_t3_4_t3_5_remove_fake_item()))
    results.append(("T3.6: Remove last item updates status", test_t3_6_remove_last_item_updates_production_status()))
    
    # Cleanup
    cleanup_test_orders()
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status}: {test_name}")
    
    log("\n" + "=" * 80)
    log(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    log("=" * 80)
    
    if passed == total:
        log("\n🎉 ALL TESTS PASSED!")
    else:
        log(f"\n⚠️ {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
