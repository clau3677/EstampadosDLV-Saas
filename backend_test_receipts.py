#!/usr/bin/env python3
"""
Backend testing for receipt upload flow (4 new endpoints)
- POST /api/orders/upload-receipt (public, multipart)
- POST /api/orders/confirm-payment (admin only)
- POST /api/orders/reject-payment (admin only)
- POST /api/orders/sweep-expired (admin only)
"""

import requests
import json
import io
import time
from datetime import datetime, timedelta
from PIL import Image

BASE_URL = "https://dtf-print-hub-2.preview.emergentagent.com/api"
ADMIN_EMAIL = "estampadosdlv@gmail.com"
ADMIN_PASSWORD = "EstampadosDLV2025!"

# Global session for cookies
session = requests.Session()
admin_token = None

def login_admin():
    """Login as admin and get token cookie"""
    global admin_token
    print("\n=== LOGIN ADMIN ===")
    resp = session.post(f"{BASE_URL}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    print(f"Login status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        admin_token = data.get('token')
        print(f"✅ Admin logged in successfully")
        return True
    else:
        print(f"❌ Login failed: {resp.text}")
        return False

def create_test_order(payment_method='transfer'):
    """Create a test order with transfer payment method"""
    print(f"\n=== CREATE TEST ORDER (paymentMethod={payment_method}) ===")
    
    # Get a product first
    resp = session.get(f"{BASE_URL}/products")
    products = resp.json()
    if not products:
        print("❌ No products found")
        return None
    
    product = products[0]
    variant = product['variants'][0] if product.get('variants') else None
    if not variant:
        print("❌ No variants found")
        return None
    
    order_data = {
        "customer": {
            "name": "Cliente Test Comprobante",
            "email": f"test.receipt.{int(time.time())}@example.com",
            "phone": "+56912345678",
            "rut": "12.345.678-9"
        },
        "items": [{
            "productId": product['id'],
            "variantId": variant['id'],
            "quantity": 1
        }],
        "deliveryMethod": "pickup",
        "paymentMethod": payment_method,
        "notes": "Test order for receipt upload"
    }
    
    resp = session.post(f"{BASE_URL}/orders/public", json=order_data)
    print(f"Create order status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ Order created: {data['orderNumber']}")
        return {
            'orderId': data['orderId'],
            'orderNumber': data['orderNumber'],
            'email': order_data['customer']['email']
        }
    else:
        print(f"❌ Failed to create order: {resp.text}")
        return None

def create_dummy_image(size_kb=5, format='JPEG'):
    """Create a dummy image in memory"""
    # Calculate dimensions to achieve target size
    # JPEG compression varies, so we'll create a larger image and check
    if size_kb < 10:
        # Small image - 200x200 should give us ~5-10KB
        width = 200
    else:
        # Large image - calculate based on target size
        # Rough estimate: 3 bytes per pixel for RGB, with compression ~10x
        width = int((size_kb * 1024 * 10 / 3) ** 0.5)
    
    # Create image with random noise to prevent excessive compression
    import random
    img = Image.new('RGB', (width, width))
    pixels = img.load()
    for i in range(width):
        for j in range(width):
            pixels[i, j] = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
    
    buffer = io.BytesIO()
    img.save(buffer, format=format, quality=85)
    buffer.seek(0)
    
    # Check actual size
    actual_size = len(buffer.getvalue())
    print(f"   Created {format} image: {width}x{width}px, {actual_size} bytes ({actual_size/1024:.1f} KB)")
    
    return buffer

def get_order_by_id(order_id):
    """Get order details by ID"""
    resp = session.get(f"{BASE_URL}/orders")
    if resp.status_code == 200:
        orders = resp.json()
        for order in orders:
            if order['id'] == order_id:
                return order
    return None

def update_order_created_at_in_db(order_id, hours_ago):
    """Update order createdAt in MongoDB directly (for sweep test)"""
    # We'll use mongosh via bash
    import subprocess
    
    new_date = datetime.utcnow() - timedelta(hours=hours_ago)
    iso_date = new_date.isoformat() + 'Z'
    
    cmd = f"""mongosh mongodb://localhost:27017/estampados_dlv --quiet --eval 'db.orders.updateOne({{id: "{order_id}"}}, {{$set: {{createdAt: new Date("{iso_date}")}}}})'"""
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        return result.returncode == 0
    except Exception as e:
        print(f"⚠️ Failed to update order createdAt: {e}")
        return False

def cleanup_test_orders(order_ids):
    """Delete test orders"""
    print(f"\n=== CLEANUP TEST ORDERS ({len(order_ids)} orders) ===")
    for order_id in order_ids:
        try:
            resp = session.post(f"{BASE_URL}/orders/delete", json={"id": order_id, "force": True})
            if resp.status_code == 200:
                print(f"✅ Deleted order {order_id}")
            else:
                print(f"⚠️ Failed to delete {order_id}: {resp.status_code}")
        except Exception as e:
            print(f"⚠️ Error deleting {order_id}: {e}")

def cleanup_receipt_files():
    """Delete test receipt files"""
    print("\n=== CLEANUP RECEIPT FILES ===")
    import subprocess
    try:
        # Remove all test receipt files
        subprocess.run("rm -rf /app/public/uploads/receipts/*", shell=True, timeout=5)
        print("✅ Receipt files cleaned")
    except Exception as e:
        print(f"⚠️ Failed to clean receipt files: {e}")

# ============================================================================
# TEST 1: POST /api/orders/upload-receipt
# ============================================================================

def test_upload_receipt():
    """Test all scenarios for upload-receipt endpoint"""
    print("\n" + "="*80)
    print("TEST 1: POST /api/orders/upload-receipt")
    print("="*80)
    
    test_orders = []
    
    # Setup: Create a test order with transfer payment
    order = create_test_order('transfer')
    if not order:
        print("❌ T1 SETUP FAILED: Could not create test order")
        return False
    
    test_orders.append(order['orderId'])
    
    # T1.1: No file → 400
    print("\n--- T1.1: Upload without file → 400 ---")
    files = {}
    data = {
        'orderNumber': order['orderNumber'],
        'email': order['email']
    }
    resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 400 and 'Archivo requerido' in resp.text:
        print("✅ T1.1 PASS: Correctly rejected upload without file")
    else:
        print(f"❌ T1.1 FAIL: Expected 400 with 'Archivo requerido', got {resp.status_code}: {resp.text}")
    
    # T1.2: PDF file → 400
    print("\n--- T1.2: Upload PDF file → 400 ---")
    pdf_buffer = io.BytesIO(b'%PDF-1.4 fake pdf content')
    files = {'file': ('receipt.pdf', pdf_buffer, 'application/pdf')}
    data = {
        'orderNumber': order['orderNumber'],
        'email': order['email']
    }
    resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 400 and 'Solo se aceptan imágenes' in resp.text:
        print("✅ T1.2 PASS: Correctly rejected PDF file")
    else:
        print(f"❌ T1.2 FAIL: Expected 400 with 'Solo se aceptan imágenes', got {resp.status_code}: {resp.text}")
    
    # T1.3: File too large (6MB) → 400
    print("\n--- T1.3: Upload 6MB file → 400 ---")
    large_img = create_dummy_image(size_kb=6000, format='JPEG')
    files = {'file': ('receipt.jpg', large_img, 'image/jpeg')}
    data = {
        'orderNumber': order['orderNumber'],
        'email': order['email']
    }
    resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 400 and 'excede el tamaño máximo' in resp.text:
        print("✅ T1.3 PASS: Correctly rejected large file")
    else:
        print(f"❌ T1.3 FAIL: Expected 400 with 'excede el tamaño máximo', got {resp.status_code}: {resp.text}")
    
    # T1.4: Wrong email → 403
    print("\n--- T1.4: Upload with wrong email → 403 ---")
    img = create_dummy_image(size_kb=5, format='JPEG')
    files = {'file': ('receipt.jpg', img, 'image/jpeg')}
    data = {
        'orderNumber': order['orderNumber'],
        'email': 'wrong.email@example.com'
    }
    resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 403 and 'email no coincide' in resp.text:
        print("✅ T1.4 PASS: Correctly rejected wrong email")
    else:
        print(f"❌ T1.4 FAIL: Expected 403 with 'email no coincide', got {resp.status_code}: {resp.text}")
    
    # T1.5: Valid upload → 200
    print("\n--- T1.5: Valid upload → 200 ---")
    img = create_dummy_image(size_kb=5, format='JPEG')
    files = {'file': ('receipt.jpg', img, 'image/jpeg')}
    data = {
        'orderNumber': order['orderNumber'],
        'email': order['email']
    }
    resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        if result.get('ok') and result.get('receiptUrl'):
            print(f"✅ T1.5 PASS: Receipt uploaded successfully")
            print(f"   receiptUrl: {result['receiptUrl']}")
            
            # Verify in DB
            order_data = get_order_by_id(order['orderId'])
            if order_data:
                print(f"   DB status: {order_data.get('status')}")
                print(f"   DB receiptUrl: {order_data.get('receiptUrl')}")
                print(f"   DB receiptMime: {order_data.get('receiptMime')}")
                print(f"   DB receiptSize: {order_data.get('receiptSize')}")
                print(f"   DB receiptUploadedAt: {order_data.get('receiptUploadedAt')}")
                
                if (order_data.get('status') == 'awaiting_payment' and
                    order_data.get('receiptUrl') and
                    order_data.get('receiptMime') == 'image/jpeg' and
                    order_data.get('receiptSize') and
                    order_data.get('receiptUploadedAt')):
                    print("✅ T1.5 DB VERIFICATION PASS")
                else:
                    print("❌ T1.5 DB VERIFICATION FAIL: Missing or incorrect fields")
        else:
            print(f"❌ T1.5 FAIL: Missing ok or receiptUrl in response")
    else:
        print(f"❌ T1.5 FAIL: Expected 200, got {resp.status_code}: {resp.text}")
    
    # T1.6: Upload to paid order → 400
    print("\n--- T1.6: Upload to paid order → 400 ---")
    # First, confirm the payment to make it paid
    resp = session.post(f"{BASE_URL}/orders/confirm-payment", json={
        "id": order['orderId'],
        "notes": "Test payment confirmation"
    })
    print(f"Confirm payment status: {resp.status_code}")
    
    # Now try to upload again
    img = create_dummy_image(size_kb=5, format='JPEG')
    files = {'file': ('receipt.jpg', img, 'image/jpeg')}
    data = {
        'orderNumber': order['orderNumber'],
        'email': order['email']
    }
    resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 400 and 'ya fue confirmado' in resp.text:
        print("✅ T1.6 PASS: Correctly rejected upload to paid order")
    else:
        print(f"❌ T1.6 FAIL: Expected 400 with 'ya fue confirmado', got {resp.status_code}: {resp.text}")
    
    # T1.7: Upload to cancelled order → 400
    print("\n--- T1.7: Upload to cancelled order → 400 ---")
    # Create another order and cancel it
    order2 = create_test_order('transfer')
    if order2:
        test_orders.append(order2['orderId'])
        
        # Cancel the order
        resp = session.post(f"{BASE_URL}/orders/cancel", json={
            "id": order2['orderId'],
            "reason": "Test cancellation"
        })
        print(f"Cancel order status: {resp.status_code}")
        
        # Try to upload
        img = create_dummy_image(size_kb=5, format='JPEG')
        files = {'file': ('receipt.jpg', img, 'image/jpeg')}
        data = {
            'orderNumber': order2['orderNumber'],
            'email': order2['email']
        }
        resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 400 and 'cancelado' in resp.text:
            print("✅ T1.7 PASS: Correctly rejected upload to cancelled order")
        else:
            print(f"❌ T1.7 FAIL: Expected 400 with 'cancelado', got {resp.status_code}: {resp.text}")
    
    # T1.8: Upload to non-existent order → 404
    print("\n--- T1.8: Upload to non-existent order → 404 ---")
    img = create_dummy_image(size_kb=5, format='JPEG')
    files = {'file': ('receipt.jpg', img, 'image/jpeg')}
    data = {
        'orderNumber': 'DLV-2025-999999',
        'email': 'test@example.com'
    }
    resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 404:
        print("✅ T1.8 PASS: Correctly returned 404 for non-existent order")
    else:
        print(f"❌ T1.8 FAIL: Expected 404, got {resp.status_code}: {resp.text}")
    
    # Cleanup
    cleanup_test_orders(test_orders)
    
    return True

# ============================================================================
# TEST 2: POST /api/orders/confirm-payment
# ============================================================================

def test_confirm_payment():
    """Test all scenarios for confirm-payment endpoint"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/orders/confirm-payment")
    print("="*80)
    
    test_orders = []
    
    # Setup: Create order and upload receipt
    order = create_test_order('transfer')
    if not order:
        print("❌ T2 SETUP FAILED: Could not create test order")
        return False
    
    test_orders.append(order['orderId'])
    
    # Upload receipt to set status to awaiting_payment
    img = create_dummy_image(size_kb=5, format='JPEG')
    files = {'file': ('receipt.jpg', img, 'image/jpeg')}
    data = {
        'orderNumber': order['orderNumber'],
        'email': order['email']
    }
    resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
    print(f"Upload receipt status: {resp.status_code}")
    
    # T2.1: Without auth → 403
    print("\n--- T2.1: Confirm payment without auth → 403 ---")
    # Create a new session without auth
    no_auth_session = requests.Session()
    resp = no_auth_session.post(f"{BASE_URL}/orders/confirm-payment", json={
        "id": order['orderId']
    })
    print(f"Status: {resp.status_code}")
    if resp.status_code == 403 and 'administradores' in resp.text:
        print("✅ T2.1 PASS: Correctly rejected without auth")
    else:
        print(f"❌ T2.1 FAIL: Expected 403 with 'administradores', got {resp.status_code}: {resp.text}")
    
    # T2.2: Non-existent order → 404
    print("\n--- T2.2: Confirm non-existent order → 404 ---")
    resp = session.post(f"{BASE_URL}/orders/confirm-payment", json={
        "id": "non-existent-id"
    })
    print(f"Status: {resp.status_code}")
    if resp.status_code == 404:
        print("✅ T2.2 PASS: Correctly returned 404")
    else:
        print(f"❌ T2.2 FAIL: Expected 404, got {resp.status_code}: {resp.text}")
    
    # T2.3: Valid confirmation → 200
    print("\n--- T2.3: Valid confirmation → 200 ---")
    resp = session.post(f"{BASE_URL}/orders/confirm-payment", json={
        "id": order['orderId'],
        "notes": "test note"
    })
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        if result.get('ok') and result.get('paidAt'):
            print(f"✅ T2.3 PASS: Payment confirmed successfully")
            
            # Verify in DB
            order_data = get_order_by_id(order['orderId'])
            if order_data:
                print(f"   DB status: {order_data.get('status')}")
                print(f"   DB paymentStatus: {order_data.get('paymentStatus')}")
                print(f"   DB paidAt: {order_data.get('paidAt')}")
                print(f"   DB paymentConfirmedAt: {order_data.get('paymentConfirmedAt')}")
                print(f"   DB paymentConfirmedBy: {order_data.get('paymentConfirmedBy')}")
                print(f"   DB paymentConfirmationNotes: {order_data.get('paymentConfirmationNotes')}")
                print(f"   DB paymentRejectionReason: {order_data.get('paymentRejectionReason')}")
                
                if (order_data.get('status') == 'paid' and
                    order_data.get('paymentStatus') == 'paid' and
                    order_data.get('paidAt') and
                    order_data.get('paymentConfirmedAt') and
                    order_data.get('paymentConfirmedBy') == ADMIN_EMAIL and
                    order_data.get('paymentConfirmationNotes') == 'test note' and
                    order_data.get('paymentRejectionReason') is None):
                    print("✅ T2.3 DB VERIFICATION PASS")
                else:
                    print("❌ T2.3 DB VERIFICATION FAIL: Missing or incorrect fields")
        else:
            print(f"❌ T2.3 FAIL: Missing ok or paidAt in response")
    else:
        print(f"❌ T2.3 FAIL: Expected 200, got {resp.status_code}: {resp.text}")
    
    # T2.4: Confirm again → 400
    print("\n--- T2.4: Confirm already confirmed order → 400 ---")
    resp = session.post(f"{BASE_URL}/orders/confirm-payment", json={
        "id": order['orderId']
    })
    print(f"Status: {resp.status_code}")
    if resp.status_code == 400 and 'ya fue confirmado' in resp.text:
        print("✅ T2.4 PASS: Correctly rejected double confirmation")
    else:
        print(f"❌ T2.4 FAIL: Expected 400 with 'ya fue confirmado', got {resp.status_code}: {resp.text}")
    
    # T2.5: Confirm cancelled order → 400
    print("\n--- T2.5: Confirm cancelled order → 400 ---")
    order2 = create_test_order('transfer')
    if order2:
        test_orders.append(order2['orderId'])
        
        # Cancel the order
        resp = session.post(f"{BASE_URL}/orders/cancel", json={
            "id": order2['orderId'],
            "reason": "Test cancellation"
        })
        print(f"Cancel order status: {resp.status_code}")
        
        # Try to confirm
        resp = session.post(f"{BASE_URL}/orders/confirm-payment", json={
            "id": order2['orderId']
        })
        print(f"Status: {resp.status_code}")
        if resp.status_code == 400 and 'cancelado' in resp.text:
            print("✅ T2.5 PASS: Correctly rejected confirmation of cancelled order")
        else:
            print(f"❌ T2.5 FAIL: Expected 400 with 'cancelado', got {resp.status_code}: {resp.text}")
    
    # Cleanup
    cleanup_test_orders(test_orders)
    
    return True

# ============================================================================
# TEST 3: POST /api/orders/reject-payment
# ============================================================================

def test_reject_payment():
    """Test all scenarios for reject-payment endpoint"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/orders/reject-payment")
    print("="*80)
    
    test_orders = []
    
    # T3.1: Without auth → 403
    print("\n--- T3.1: Reject payment without auth → 403 ---")
    no_auth_session = requests.Session()
    resp = no_auth_session.post(f"{BASE_URL}/orders/reject-payment", json={
        "id": "some-id",
        "reason": "test"
    })
    print(f"Status: {resp.status_code}")
    if resp.status_code == 403:
        print("✅ T3.1 PASS: Correctly rejected without auth")
    else:
        print(f"❌ T3.1 FAIL: Expected 403, got {resp.status_code}: {resp.text}")
    
    # Setup: Create order and upload receipt
    order = create_test_order('transfer')
    if not order:
        print("❌ T3 SETUP FAILED: Could not create test order")
        return False
    
    test_orders.append(order['orderId'])
    
    # Upload receipt
    img = create_dummy_image(size_kb=5, format='JPEG')
    files = {'file': ('receipt.jpg', img, 'image/jpeg')}
    data = {
        'orderNumber': order['orderNumber'],
        'email': order['email']
    }
    resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
    print(f"Upload receipt status: {resp.status_code}")
    
    # T3.2: Without reason → 400
    print("\n--- T3.2: Reject without reason → 400 ---")
    resp = session.post(f"{BASE_URL}/orders/reject-payment", json={
        "id": order['orderId']
    })
    print(f"Status: {resp.status_code}")
    if resp.status_code == 400 and 'motivo del rechazo' in resp.text:
        print("✅ T3.2 PASS: Correctly rejected without reason")
    else:
        print(f"❌ T3.2 FAIL: Expected 400 with 'motivo del rechazo', got {resp.status_code}: {resp.text}")
    
    # T3.3: Non-existent order → 404
    print("\n--- T3.3: Reject non-existent order → 404 ---")
    resp = session.post(f"{BASE_URL}/orders/reject-payment", json={
        "id": "non-existent-id",
        "reason": "test"
    })
    print(f"Status: {resp.status_code}")
    if resp.status_code == 404:
        print("✅ T3.3 PASS: Correctly returned 404")
    else:
        print(f"❌ T3.3 FAIL: Expected 404, got {resp.status_code}: {resp.text}")
    
    # T3.4: Reject pending order (without receipt) → 400
    print("\n--- T3.4: Reject pending order without receipt → 400 ---")
    order2 = create_test_order('transfer')
    if order2:
        test_orders.append(order2['orderId'])
        
        # Try to reject without uploading receipt first
        resp = session.post(f"{BASE_URL}/orders/reject-payment", json={
            "id": order2['orderId'],
            "reason": "test rejection"
        })
        print(f"Status: {resp.status_code}")
        if resp.status_code == 400 and 'esperando confirmación' in resp.text:
            print("✅ T3.4 PASS: Correctly rejected pending order without receipt")
        else:
            print(f"❌ T3.4 FAIL: Expected 400 with 'esperando confirmación', got {resp.status_code}: {resp.text}")
    
    # T3.5: Valid rejection → 200
    print("\n--- T3.5: Valid rejection → 200 ---")
    resp = session.post(f"{BASE_URL}/orders/reject-payment", json={
        "id": order['orderId'],
        "reason": "Monto no coincide"
    })
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        if result.get('ok') and result.get('rejectedAt'):
            print(f"✅ T3.5 PASS: Payment rejected successfully")
            
            # Verify in DB
            order_data = get_order_by_id(order['orderId'])
            if order_data:
                print(f"   DB status: {order_data.get('status')}")
                print(f"   DB receiptUrl: {order_data.get('receiptUrl')}")
                print(f"   DB receiptUploadedAt: {order_data.get('receiptUploadedAt')}")
                print(f"   DB paymentRejectionReason: {order_data.get('paymentRejectionReason')}")
                print(f"   DB paymentRejectedAt: {order_data.get('paymentRejectedAt')}")
                print(f"   DB paymentRejectedBy: {order_data.get('paymentRejectedBy')}")
                
                if (order_data.get('status') == 'pending' and
                    order_data.get('receiptUrl') is None and
                    order_data.get('receiptUploadedAt') is None and
                    order_data.get('paymentRejectionReason') == 'Monto no coincide' and
                    order_data.get('paymentRejectedAt') and
                    order_data.get('paymentRejectedBy') == ADMIN_EMAIL):
                    print("✅ T3.5 DB VERIFICATION PASS")
                else:
                    print("❌ T3.5 DB VERIFICATION FAIL: Missing or incorrect fields")
        else:
            print(f"❌ T3.5 FAIL: Missing ok or rejectedAt in response")
    else:
        print(f"❌ T3.5 FAIL: Expected 200, got {resp.status_code}: {resp.text}")
    
    # T3.6: Re-upload after rejection → 200
    print("\n--- T3.6: Re-upload after rejection → 200 ---")
    img = create_dummy_image(size_kb=5, format='JPEG')
    files = {'file': ('receipt.jpg', img, 'image/jpeg')}
    data = {
        'orderNumber': order['orderNumber'],
        'email': order['email']
    }
    resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        print(f"✅ T3.6 PASS: Re-upload after rejection successful")
        
        # Verify rejection reason is cleared
        order_data = get_order_by_id(order['orderId'])
        if order_data:
            print(f"   DB status: {order_data.get('status')}")
            print(f"   DB paymentRejectionReason: {order_data.get('paymentRejectionReason')}")
            
            if (order_data.get('status') == 'awaiting_payment' and
                order_data.get('paymentRejectionReason') is None):
                print("✅ T3.6 DB VERIFICATION PASS: Rejection reason cleared")
            else:
                print("❌ T3.6 DB VERIFICATION FAIL: Rejection reason not cleared")
    else:
        print(f"❌ T3.6 FAIL: Expected 200, got {resp.status_code}: {resp.text}")
    
    # Cleanup
    cleanup_test_orders(test_orders)
    
    return True

# ============================================================================
# TEST 4: POST /api/orders/sweep-expired
# ============================================================================

def test_sweep_expired():
    """Test all scenarios for sweep-expired endpoint"""
    print("\n" + "="*80)
    print("TEST 4: POST /api/orders/sweep-expired")
    print("="*80)
    
    test_orders = []
    
    # T4.1: Without auth → 403
    print("\n--- T4.1: Sweep without auth → 403 ---")
    no_auth_session = requests.Session()
    resp = no_auth_session.post(f"{BASE_URL}/orders/sweep-expired", json={})
    print(f"Status: {resp.status_code}")
    if resp.status_code == 403:
        print("✅ T4.1 PASS: Correctly rejected without auth")
    else:
        print(f"❌ T4.1 FAIL: Expected 403, got {resp.status_code}: {resp.text}")
    
    # Setup: Create 3 old orders (30h ago) and 1 recent order
    print("\n--- SETUP: Creating test orders ---")
    
    # Create 3 old orders
    old_orders = []
    for i in range(3):
        order = create_test_order('transfer')
        if order:
            test_orders.append(order['orderId'])
            old_orders.append(order)
            # Update createdAt to 30 hours ago
            success = update_order_created_at_in_db(order['orderId'], 30)
            print(f"Updated order {i+1} createdAt to 30h ago: {success}")
    
    # Create 1 recent order (< 24h)
    recent_order = create_test_order('transfer')
    if recent_order:
        test_orders.append(recent_order['orderId'])
        print(f"Created recent order: {recent_order['orderNumber']}")
    
    # Create 1 order with receipt (awaiting_payment)
    order_with_receipt = create_test_order('transfer')
    if order_with_receipt:
        test_orders.append(order_with_receipt['orderId'])
        
        # Upload receipt
        img = create_dummy_image(size_kb=5, format='JPEG')
        files = {'file': ('receipt.jpg', img, 'image/jpeg')}
        data = {
            'orderNumber': order_with_receipt['orderNumber'],
            'email': order_with_receipt['email']
        }
        resp = session.post(f"{BASE_URL}/orders/upload-receipt", data=data, files=files)
        print(f"Uploaded receipt for order: {order_with_receipt['orderNumber']}, status: {resp.status_code}")
        
        # Update createdAt to 30 hours ago
        update_order_created_at_in_db(order_with_receipt['orderId'], 30)
    
    # T4.2: Valid sweep → 200
    print("\n--- T4.2: Valid sweep → 200 ---")
    resp = session.post(f"{BASE_URL}/orders/sweep-expired", json={})
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if result.get('ok'):
            print(f"✅ T4.2 PASS: Sweep executed successfully")
            print(f"   Found: {result.get('found')}")
            print(f"   Cancelled: {result.get('cancelled')}")
            print(f"   Cancelled numbers: {result.get('cancelledNumbers')}")
            
            # Verify expectations
            if result.get('found') >= 3 and result.get('cancelled') == result.get('found'):
                print("✅ T4.2 VERIFICATION PASS: Found and cancelled expected orders")
                
                # Verify old orders are cancelled
                for old_order in old_orders:
                    order_data = get_order_by_id(old_order['orderId'])
                    if order_data:
                        print(f"   Order {old_order['orderNumber']}: status={order_data.get('status')}, cancelReason={order_data.get('cancelReason')}")
                        if (order_data.get('status') == 'cancelled' and
                            'Auto-cancelado' in (order_data.get('cancelReason') or '') and
                            order_data.get('cancelledBy') == 'system'):
                            print(f"   ✅ Order {old_order['orderNumber']} correctly cancelled")
                        else:
                            print(f"   ❌ Order {old_order['orderNumber']} not correctly cancelled")
                
                # Verify recent order is NOT cancelled
                recent_data = get_order_by_id(recent_order['orderId'])
                if recent_data:
                    print(f"   Recent order {recent_order['orderNumber']}: status={recent_data.get('status')}")
                    if recent_data.get('status') == 'pending':
                        print(f"   ✅ Recent order NOT cancelled (correct)")
                    else:
                        print(f"   ❌ Recent order was cancelled (incorrect)")
                
                # Verify order with receipt is NOT cancelled
                receipt_data = get_order_by_id(order_with_receipt['orderId'])
                if receipt_data:
                    print(f"   Order with receipt {order_with_receipt['orderNumber']}: status={receipt_data.get('status')}")
                    if receipt_data.get('status') == 'awaiting_payment':
                        print(f"   ✅ Order with receipt NOT cancelled (correct)")
                    else:
                        print(f"   ❌ Order with receipt was cancelled (incorrect)")
            else:
                print(f"❌ T4.2 VERIFICATION FAIL: Expected found >= 3, got {result.get('found')}")
        else:
            print(f"❌ T4.2 FAIL: Missing ok in response")
    else:
        print(f"❌ T4.2 FAIL: Expected 200, got {resp.status_code}: {resp.text}")
    
    # T4.3: Sweep again → found=0
    print("\n--- T4.3: Sweep again → found=0 ---")
    resp = session.post(f"{BASE_URL}/orders/sweep-expired", json={})
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        result = resp.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if result.get('found') == 0 and result.get('cancelled') == 0:
            print("✅ T4.3 PASS: No more expired orders found")
        else:
            print(f"❌ T4.3 FAIL: Expected found=0, cancelled=0, got found={result.get('found')}, cancelled={result.get('cancelled')}")
    else:
        print(f"❌ T4.3 FAIL: Expected 200, got {resp.status_code}: {resp.text}")
    
    # Cleanup
    cleanup_test_orders(test_orders)
    cleanup_receipt_files()
    
    return True

# ============================================================================
# MAIN
# ============================================================================

def main():
    print("="*80)
    print("BACKEND TESTING: Receipt Upload Flow (4 Endpoints)")
    print("="*80)
    
    # Login as admin
    if not login_admin():
        print("\n❌ FATAL: Could not login as admin")
        return
    
    # Run all tests
    try:
        test_upload_receipt()
        test_confirm_payment()
        test_reject_payment()
        test_sweep_expired()
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "="*80)
    print("TESTING COMPLETE")
    print("="*80)

if __name__ == "__main__":
    main()
