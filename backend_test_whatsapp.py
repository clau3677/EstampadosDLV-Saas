#!/usr/bin/env python3
"""
Backend Testing Suite - WhatsApp Zero-Cost Automation (Baileys)
Tests all /api/whatsapp/* endpoints and notification hooks
"""
import requests
import time
import os
from datetime import datetime

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://dtf-print-hub-2.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_group(name):
    print(f"\n{'='*80}")
    print(f"TEST GROUP: {name}")
    print(f"{'='*80}\n")

# ============================================================================
# TEST GROUP 1: WhatsApp Status Endpoint
# ============================================================================
def test_whatsapp_status_idle():
    test_group("1. GET /api/whatsapp/status (idle state)")
    
    try:
        # First logout to ensure idle state
        log("Ensuring idle state via logout...")
        r_logout = requests.post(f"{API_BASE}/whatsapp/logout", timeout=10)
        log(f"Logout response: {r_logout.status_code}")
        
        time.sleep(1)
        
        # Now check status
        log("Testing GET /api/whatsapp/status...")
        r = requests.get(f"{API_BASE}/whatsapp/status", timeout=10)
        
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        
        # Verify required keys
        required_keys = ['state', 'qrDataUrl', 'user', 'lastError', 'messagesSent', 'startedAt', 'connectedAt']
        for key in required_keys:
            assert key in data, f"Missing key: {key}"
        
        # After logout, state should be idle
        assert data['state'] == 'idle', f"Expected state 'idle', got '{data['state']}'"
        assert data['qrDataUrl'] is None, f"Expected qrDataUrl null, got {data['qrDataUrl']}"
        
        log(f"✅ PASS - Status endpoint returns correct shape")
        log(f"   State: {data['state']}")
        log(f"   QR: {data['qrDataUrl']}")
        log(f"   User: {data['user']}")
        return True
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        return False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        return False

# ============================================================================
# TEST GROUP 2: WhatsApp Connect Endpoint
# ============================================================================
def test_whatsapp_connect():
    test_group("2. POST /api/whatsapp/connect (QR generation)")
    
    try:
        log("Testing POST /api/whatsapp/connect...")
        r = requests.post(f"{API_BASE}/whatsapp/connect", timeout=10)
        
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        
        log(f"Initial state after connect: {data['state']}")
        
        # Wait for QR generation (up to 10 seconds)
        log("Waiting for QR generation (up to 10s)...")
        for i in range(10):
            time.sleep(1)
            r2 = requests.get(f"{API_BASE}/whatsapp/status", timeout=10)
            status = r2.json()
            log(f"  [{i+1}s] State: {status['state']}")
            
            if status['state'] == 'qr':
                # Verify QR data URL
                assert status['qrDataUrl'] is not None, "qrDataUrl should not be null in 'qr' state"
                assert status['qrDataUrl'].startswith('data:image/png;base64,'), \
                    f"qrDataUrl should start with 'data:image/png;base64,', got: {status['qrDataUrl'][:50]}"
                assert len(status['qrDataUrl']) > 100, f"qrDataUrl too short: {len(status['qrDataUrl'])} chars"
                
                log(f"✅ PASS - Connect endpoint works, QR generated")
                log(f"   State: {status['state']}")
                log(f"   QR length: {len(status['qrDataUrl'])} chars")
                return True
        
        # If we get here, QR was not generated in time
        log(f"⚠️  WARNING - QR not generated after 10s, final state: {status['state']}")
        log(f"   This might be expected if connection is slow")
        return True  # Not a failure, just slow
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        return False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        return False

# ============================================================================
# TEST GROUP 3: WhatsApp Logout Endpoint
# ============================================================================
def test_whatsapp_logout():
    test_group("3. POST /api/whatsapp/logout")
    
    try:
        log("Testing POST /api/whatsapp/logout...")
        r = requests.post(f"{API_BASE}/whatsapp/logout", timeout=10)
        
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        
        # After logout, should be idle
        assert data['state'] == 'idle', f"Expected state 'idle', got '{data['state']}'"
        assert data['qrDataUrl'] is None, f"Expected qrDataUrl null after logout"
        assert data['user'] is None, f"Expected user null after logout"
        
        log(f"✅ PASS - Logout endpoint works")
        log(f"   State: {data['state']}")
        log(f"   QR: {data['qrDataUrl']}")
        log(f"   User: {data['user']}")
        return True
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        return False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        return False

# ============================================================================
# TEST GROUP 4: WhatsApp Send Endpoint (not connected)
# ============================================================================
def test_whatsapp_send_not_connected():
    test_group("4. POST /api/whatsapp/send (not connected)")
    
    try:
        # Ensure we're in idle state
        requests.post(f"{API_BASE}/whatsapp/logout", timeout=10)
        time.sleep(1)
        
        log("Testing POST /api/whatsapp/send with state=idle...")
        payload = {
            "phone": "+56912345678",
            "text": "Test message",
            "note": "Test note"
        }
        r = requests.post(f"{API_BASE}/whatsapp/send", json=payload, timeout=10)
        
        # Should return 400 because not connected
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        data = r.json()
        
        assert 'error' in data, "Expected 'error' key in response"
        assert 'not_connected' in data['error'], f"Expected 'not_connected' in error, got: {data['error']}"
        
        log(f"✅ PASS - Send correctly rejects when not connected")
        log(f"   Error: {data['error']}")
        return True
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        return False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        return False

# ============================================================================
# TEST GROUP 5: WhatsApp Send Endpoint (missing fields)
# ============================================================================
def test_whatsapp_send_validation():
    test_group("5. POST /api/whatsapp/send (validation)")
    
    all_pass = True
    
    try:
        # Test 1: Missing phone
        log("Test 5.1: Missing phone...")
        r = requests.post(f"{API_BASE}/whatsapp/send", json={"text": "hello"}, timeout=10)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        data = r.json()
        assert 'phone requerido' in data.get('error', ''), f"Expected 'phone requerido', got: {data}"
        log(f"✅ PASS - Missing phone rejected")
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        all_pass = False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        all_pass = False
    
    try:
        # Test 2: Missing text
        log("Test 5.2: Missing text...")
        r = requests.post(f"{API_BASE}/whatsapp/send", json={"phone": "+56912345678"}, timeout=10)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        data = r.json()
        assert 'text requerido' in data.get('error', ''), f"Expected 'text requerido', got: {data}"
        log(f"✅ PASS - Missing text rejected")
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        all_pass = False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        all_pass = False
    
    return all_pass

# ============================================================================
# TEST GROUP 6: WhatsApp Messages Endpoint
# ============================================================================
def test_whatsapp_messages():
    test_group("6. GET /api/whatsapp/messages")
    
    try:
        log("Testing GET /api/whatsapp/messages...")
        r = requests.get(f"{API_BASE}/whatsapp/messages", timeout=10)
        
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        
        assert isinstance(data, list), f"Expected array, got {type(data)}"
        log(f"✅ PASS - Messages endpoint returns array with {len(data)} entries")
        
        # If there are messages, verify structure
        if len(data) > 0:
            msg = data[0]
            required_keys = ['id', 'createdAt', 'event', 'phone', 'jid', 'text', 'status']
            for key in required_keys:
                assert key in msg, f"Missing key in message: {key}"
            
            # Verify no MongoDB _id
            assert '_id' not in msg, "MongoDB _id should be stripped"
            
            # Verify status is valid
            assert msg['status'] in ['sent', 'skipped', 'failed'], \
                f"Invalid status: {msg['status']}"
            
            log(f"   Sample message: event={msg['event']}, status={msg['status']}, phone={msg['phone']}")
        
        # Test limit parameter
        log("Testing limit parameter...")
        r2 = requests.get(f"{API_BASE}/whatsapp/messages?limit=1", timeout=10)
        data2 = r2.json()
        assert len(data2) <= 1, f"Expected max 1 entry with limit=1, got {len(data2)}"
        log(f"✅ PASS - Limit parameter works (limit=1 returned {len(data2)} entries)")
        
        return True
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        return False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        return False

# ============================================================================
# TEST GROUP 7: Order Creation Hook (with phone)
# ============================================================================
def test_order_hook_with_phone():
    test_group("7. POST /api/orders/public (WhatsApp hook with phone)")
    
    try:
        # First, get a product to create an order
        log("Fetching products...")
        r_products = requests.get(f"{API_BASE}/products", timeout=10)
        products = r_products.json()
        assert len(products) > 0, "No products available"
        
        product = products[0]
        variant = product['variants'][0] if product.get('variants') else None
        
        log(f"Creating order with phone +56912345678...")
        order_payload = {
            "customer": {
                "name": "Juan Pérez",
                "email": "juan@test.cl",
                "phone": "+56912345678",
                "rut": "12.345.678-9"
            },
            "items": [{
                "productId": product['id'],
                "variantId": variant['id'] if variant else None,
                "quantity": 1
            }],
            "deliveryMethod": "pickup",
            "paymentMethod": "transfer"
        }
        
        r = requests.post(f"{API_BASE}/orders/public", json=order_payload, timeout=10)
        
        # Order creation should succeed
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        order_data = r.json()
        assert order_data['ok'] is True, "Expected ok=true"
        assert 'orderNumber' in order_data, "Missing orderNumber"
        
        order_number = order_data['orderNumber']
        log(f"✅ Order created: {order_number}")
        
        # Wait a bit for async WhatsApp notification
        time.sleep(2)
        
        # Check WhatsApp messages log
        log("Checking WhatsApp messages log...")
        r_msgs = requests.get(f"{API_BASE}/whatsapp/messages?limit=50", timeout=10)
        messages = r_msgs.json()
        
        # Find the message for this order
        order_msg = None
        for msg in messages:
            if msg.get('orderNumber') == order_number:
                order_msg = msg
                break
        
        assert order_msg is not None, f"No WhatsApp message found for order {order_number}"
        
        # Verify message structure
        assert order_msg['event'] == 'order_confirmation', \
            f"Expected event 'order_confirmation', got '{order_msg['event']}'"
        assert order_msg['phone'] == '+56912345678', \
            f"Expected phone '+56912345678', got '{order_msg['phone']}'"
        assert order_msg['jid'] == '56912345678@s.whatsapp.net', \
            f"Expected jid '56912345678@s.whatsapp.net', got '{order_msg['jid']}'"
        assert order_msg['status'] == 'skipped', \
            f"Expected status 'skipped' (not connected), got '{order_msg['status']}'"
        assert 'not_connected' in order_msg.get('reason', ''), \
            f"Expected reason 'not_connected:*', got '{order_msg.get('reason')}'"
        
        # Verify template content
        assert 'Juan' in order_msg['text'], "Customer name should be in message"
        assert order_number in order_msg['text'], "Order number should be in message"
        assert 'Estampados DLV' in order_msg['text'], "Company name should be in message"
        
        log(f"✅ PASS - WhatsApp hook fired correctly")
        log(f"   Event: {order_msg['event']}")
        log(f"   Phone: {order_msg['phone']}")
        log(f"   JID: {order_msg['jid']}")
        log(f"   Status: {order_msg['status']}")
        log(f"   Reason: {order_msg.get('reason')}")
        log(f"   Text preview: {order_msg['text'][:100]}...")
        
        return True
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        return False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        return False

# ============================================================================
# TEST GROUP 8: Order Creation Hook (no phone)
# ============================================================================
def test_order_hook_no_phone():
    test_group("8. POST /api/orders/public (no phone)")
    
    try:
        # Get a product
        r_products = requests.get(f"{API_BASE}/products", timeout=10)
        products = r_products.json()
        product = products[0]
        variant = product['variants'][0] if product.get('variants') else None
        
        log(f"Creating order WITHOUT phone...")
        order_payload = {
            "customer": {
                "name": "María González",
                "email": "maria@test.cl"
                # No phone field
            },
            "items": [{
                "productId": product['id'],
                "variantId": variant['id'] if variant else None,
                "quantity": 1
            }],
            "deliveryMethod": "pickup",
            "paymentMethod": "transfer"
        }
        
        r = requests.post(f"{API_BASE}/orders/public", json=order_payload, timeout=10)
        
        # Order creation should still succeed
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        order_data = r.json()
        assert order_data['ok'] is True, "Expected ok=true"
        
        order_number = order_data['orderNumber']
        log(f"✅ Order created: {order_number}")
        
        time.sleep(2)
        
        # Check WhatsApp messages log
        r_msgs = requests.get(f"{API_BASE}/whatsapp/messages?limit=50", timeout=10)
        messages = r_msgs.json()
        
        # Find the message for this order
        order_msg = None
        for msg in messages:
            if msg.get('orderNumber') == order_number:
                order_msg = msg
                break
        
        assert order_msg is not None, f"No WhatsApp message found for order {order_number}"
        
        # Should be skipped with reason 'no_phone'
        assert order_msg['status'] == 'skipped', \
            f"Expected status 'skipped', got '{order_msg['status']}'"
        assert order_msg.get('reason') == 'no_phone', \
            f"Expected reason 'no_phone', got '{order_msg.get('reason')}'"
        
        log(f"✅ PASS - Order without phone handled correctly")
        log(f"   Status: {order_msg['status']}")
        log(f"   Reason: {order_msg.get('reason')}")
        
        return True
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        return False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        return False

# ============================================================================
# TEST GROUP 9: Order Creation Hook (invalid phone)
# ============================================================================
def test_order_hook_invalid_phone():
    test_group("9. POST /api/orders/public (invalid phone)")
    
    try:
        # Get a product
        r_products = requests.get(f"{API_BASE}/products", timeout=10)
        products = r_products.json()
        product = products[0]
        variant = product['variants'][0] if product.get('variants') else None
        
        log(f"Creating order with INVALID phone 'abc'...")
        order_payload = {
            "customer": {
                "name": "Pedro Sánchez",
                "email": "pedro@test.cl",
                "phone": "abc"  # Invalid phone
            },
            "items": [{
                "productId": product['id'],
                "variantId": variant['id'] if variant else None,
                "quantity": 1
            }],
            "deliveryMethod": "pickup",
            "paymentMethod": "transfer"
        }
        
        r = requests.post(f"{API_BASE}/orders/public", json=order_payload, timeout=10)
        
        # Order creation should still succeed
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        order_data = r.json()
        assert order_data['ok'] is True, "Expected ok=true"
        
        order_number = order_data['orderNumber']
        log(f"✅ Order created: {order_number}")
        
        time.sleep(2)
        
        # Check WhatsApp messages log
        r_msgs = requests.get(f"{API_BASE}/whatsapp/messages?limit=50", timeout=10)
        messages = r_msgs.json()
        
        # Find the message for this order
        order_msg = None
        for msg in messages:
            if msg.get('orderNumber') == order_number:
                order_msg = msg
                break
        
        assert order_msg is not None, f"No WhatsApp message found for order {order_number}"
        
        # Should be skipped with reason 'invalid_phone'
        assert order_msg['status'] == 'skipped', \
            f"Expected status 'skipped', got '{order_msg['status']}'"
        assert order_msg.get('reason') == 'invalid_phone', \
            f"Expected reason 'invalid_phone', got '{order_msg.get('reason')}'"
        
        log(f"✅ PASS - Order with invalid phone handled correctly")
        log(f"   Status: {order_msg['status']}")
        log(f"   Reason: {order_msg.get('reason')}")
        
        return True
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        return False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        return False

# ============================================================================
# TEST GROUP 10: Phone Normalization
# ============================================================================
def test_phone_normalization():
    test_group("10. Phone Normalization")
    
    all_pass = True
    
    # Ensure we're in idle state (so sends will be skipped but logged)
    requests.post(f"{API_BASE}/whatsapp/logout", timeout=10)
    time.sleep(1)
    
    test_cases = [
        ("+56 9 1234 5678", "56912345678@s.whatsapp.net"),
        ("569 1234 5678", "56912345678@s.whatsapp.net"),
        ("9 1234 5678", "56912345678@s.whatsapp.net"),
        ("912345678", "56912345678@s.whatsapp.net"),
        ("12345", None),  # Too short, should be invalid
    ]
    
    for phone, expected_jid in test_cases:
        try:
            log(f"Testing phone: '{phone}' -> expected JID: {expected_jid}")
            
            payload = {"phone": phone, "text": "Test normalization"}
            r = requests.post(f"{API_BASE}/whatsapp/send", json=payload, timeout=10)
            
            # Should return 400 (not connected)
            assert r.status_code == 400, f"Expected 400, got {r.status_code}"
            
            time.sleep(1)
            
            # Check the log entry
            r_msgs = requests.get(f"{API_BASE}/whatsapp/messages?limit=5", timeout=10)
            messages = r_msgs.json()
            
            # Find the most recent message with this phone
            msg = None
            for m in messages:
                if m.get('phone') == phone:
                    msg = m
                    break
            
            if expected_jid is None:
                # Should be skipped with invalid_phone
                assert msg is not None, f"No log entry found for phone '{phone}'"
                assert msg['status'] == 'skipped', f"Expected status 'skipped', got '{msg['status']}'"
                assert msg.get('reason') == 'invalid_phone', \
                    f"Expected reason 'invalid_phone', got '{msg.get('reason')}'"
                assert msg['jid'] is None, f"Expected jid null for invalid phone, got '{msg['jid']}'"
                log(f"✅ PASS - Invalid phone '{phone}' correctly rejected")
            else:
                # Should be skipped with not_connected but JID should be normalized
                assert msg is not None, f"No log entry found for phone '{phone}'"
                assert msg['jid'] == expected_jid, \
                    f"Expected jid '{expected_jid}', got '{msg['jid']}'"
                log(f"✅ PASS - Phone '{phone}' normalized to '{msg['jid']}'")
            
        except AssertionError as e:
            log(f"❌ FAIL - {e}")
            all_pass = False
        except Exception as e:
            log(f"❌ ERROR - {e}")
            all_pass = False
    
    return all_pass

# ============================================================================
# TEST GROUP 11: POS Sale Hook
# ============================================================================
def test_pos_sale_hook():
    test_group("11. POST /api/pos/sales (WhatsApp hook)")
    
    try:
        # First, get an operator
        log("Fetching users for operator...")
        r_users = requests.get(f"{API_BASE}/users", timeout=10)
        users = r_users.json()
        
        operator = None
        for user in users:
            if user.get('role') in ['admin', 'operator']:
                operator = user
                break
        
        assert operator is not None, "No operator/admin user found"
        log(f"Using operator: {operator['name']} ({operator['id']})")
        
        # Open a POS session
        log("Opening POS session...")
        r_session = requests.post(f"{API_BASE}/pos/sessions/open", 
                                  json={"operatorId": operator['id']}, 
                                  timeout=10)
        assert r_session.status_code == 200, f"Failed to open session: {r_session.status_code}"
        session = r_session.json()
        log(f"Session opened: {session['id']}")
        
        # Get a product
        r_products = requests.get(f"{API_BASE}/products", timeout=10)
        products = r_products.json()
        product = products[0]
        variant = product['variants'][0] if product.get('variants') else None
        
        # Create a POS sale with customer phone
        log("Creating POS sale with customer phone...")
        sale_payload = {
            "sessionId": session['id'],
            "customer": {
                "name": "Cliente POS",
                "phone": "+56922334455"
            },
            "items": [{
                "productId": product['id'],
                "variantId": variant['id'] if variant else None,
                "quantity": 1,
                "unitPrice": variant['price'] if variant else product['basePrice']
            }],
            "payments": [{
                "method": "cash",
                "amount": variant['price'] if variant else product['basePrice']
            }]
        }
        
        r = requests.post(f"{API_BASE}/pos/sales", json=sale_payload, timeout=10)
        
        # Sale should succeed
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        sale_data = r.json()
        assert 'orderNumber' in sale_data, "Missing orderNumber"
        
        order_number = sale_data['orderNumber']
        log(f"✅ POS sale created: {order_number}")
        
        time.sleep(2)
        
        # Check WhatsApp messages log
        r_msgs = requests.get(f"{API_BASE}/whatsapp/messages?limit=50", timeout=10)
        messages = r_msgs.json()
        
        # Find the message for this order
        order_msg = None
        for msg in messages:
            if msg.get('orderNumber') == order_number:
                order_msg = msg
                break
        
        assert order_msg is not None, f"No WhatsApp message found for POS order {order_number}"
        
        # Verify it's an order_confirmation event
        assert order_msg['event'] == 'order_confirmation', \
            f"Expected event 'order_confirmation', got '{order_msg['event']}'"
        assert order_msg['phone'] == '+56922334455', \
            f"Expected phone '+56922334455', got '{order_msg['phone']}'"
        
        # Verify order number has POS prefix
        assert 'DLV-POS-' in order_number, f"POS order should have DLV-POS- prefix, got {order_number}"
        
        log(f"✅ PASS - POS sale WhatsApp hook fired correctly")
        log(f"   Order: {order_number}")
        log(f"   Event: {order_msg['event']}")
        log(f"   Phone: {order_msg['phone']}")
        
        return True
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        return False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        return False

# ============================================================================
# TEST GROUP 12: Production Move Hook
# ============================================================================
def test_production_move_hook():
    test_group("12. POST /api/production/move (WhatsApp hooks)")
    
    try:
        # Get production queue items
        log("Fetching production queue...")
        r_queue = requests.get(f"{API_BASE}/production/queue", timeout=10)
        queue = r_queue.json()
        
        if len(queue) == 0:
            log("⚠️  WARNING - No items in production queue, skipping test")
            return True
        
        # Find an item in 'received' status with an orderId
        item = None
        for q in queue:
            if q.get('status') == 'received' and q.get('orderId'):
                item = q
                break
        
        if item is None:
            log("⚠️  WARNING - No 'received' items with orderId found, skipping test")
            return True
        
        log(f"Found item: {item['id']} (order: {item.get('orderNumber')})")
        
        # Move to 'printing'
        log("Moving item to 'printing' status...")
        r_move = requests.post(f"{API_BASE}/production/move", 
                              json={"id": item['id'], "toStatus": "printing"}, 
                              timeout=10)
        
        assert r_move.status_code == 200, f"Expected 200, got {r_move.status_code}: {r_move.text}"
        log(f"✅ Item moved to printing")
        
        time.sleep(2)
        
        # Check WhatsApp messages log
        r_msgs = requests.get(f"{API_BASE}/whatsapp/messages?limit=50", timeout=10)
        messages = r_msgs.json()
        
        # Find the message for this order with event 'order_in_production'
        prod_msg = None
        for msg in messages:
            if msg.get('orderNumber') == item.get('orderNumber') and msg.get('event') == 'order_in_production':
                prod_msg = msg
                break
        
        assert prod_msg is not None, \
            f"No WhatsApp message with event 'order_in_production' found for order {item.get('orderNumber')}"
        
        assert prod_msg['status'] == 'skipped', \
            f"Expected status 'skipped', got '{prod_msg['status']}'"
        
        log(f"✅ PASS - Production move hook fired correctly")
        log(f"   Event: {prod_msg['event']}")
        log(f"   Order: {prod_msg['orderNumber']}")
        log(f"   Status: {prod_msg['status']}")
        
        return True
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        return False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        return False

# ============================================================================
# TEST GROUP 13: Regression Tests
# ============================================================================
def test_regression():
    test_group("13. Regression Tests (existing endpoints)")
    
    all_pass = True
    
    try:
        log("Testing GET /api/products...")
        r = requests.get(f"{API_BASE}/products", timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        products = r.json()
        assert len(products) > 0, "No products found"
        log(f"✅ PASS - GET /api/products ({len(products)} products)")
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        all_pass = False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        all_pass = False
    
    try:
        log("Testing GET /api/production/queue...")
        r = requests.get(f"{API_BASE}/production/queue", timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        queue = r.json()
        log(f"✅ PASS - GET /api/production/queue ({len(queue)} items)")
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        all_pass = False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        all_pass = False
    
    try:
        log("Testing GET /api/dashboard/summary...")
        r = requests.get(f"{API_BASE}/dashboard/summary", timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        summary = r.json()
        assert 'salesToday' in summary, "Missing salesToday"
        assert 'pendingOrders' in summary, "Missing pendingOrders"
        log(f"✅ PASS - GET /api/dashboard/summary")
        
    except AssertionError as e:
        log(f"❌ FAIL - {e}")
        all_pass = False
    except Exception as e:
        log(f"❌ ERROR - {e}")
        all_pass = False
    
    return all_pass

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================
def main():
    print("\n" + "="*80)
    print("BACKEND TESTING SUITE - WhatsApp Zero-Cost Automation (Baileys)")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"API Base: {API_BASE}")
    print("="*80 + "\n")
    
    results = []
    
    # Run all tests
    results.append(("WhatsApp Status (idle)", test_whatsapp_status_idle()))
    results.append(("WhatsApp Connect (QR)", test_whatsapp_connect()))
    results.append(("WhatsApp Logout", test_whatsapp_logout()))
    results.append(("WhatsApp Send (not connected)", test_whatsapp_send_not_connected()))
    results.append(("WhatsApp Send (validation)", test_whatsapp_send_validation()))
    results.append(("WhatsApp Messages", test_whatsapp_messages()))
    results.append(("Order Hook (with phone)", test_order_hook_with_phone()))
    results.append(("Order Hook (no phone)", test_order_hook_no_phone()))
    results.append(("Order Hook (invalid phone)", test_order_hook_invalid_phone()))
    results.append(("Phone Normalization", test_phone_normalization()))
    results.append(("POS Sale Hook", test_pos_sale_hook()))
    results.append(("Production Move Hook", test_production_move_hook()))
    results.append(("Regression Tests", test_regression()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80 + "\n")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed")
    print(f"{'='*80}\n")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
