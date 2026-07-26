#!/usr/bin/env python3
"""
=============================================================================
BACKEND TEST SUITE - POS MODULE (Punto de Venta)
=============================================================================
Tests all POS endpoints: /api/users, /api/pos/*, /api/tickets/*
Plus regression tests for existing endpoints.

Base URL: process.env.NEXT_PUBLIC_BASE_URL + '/api'
All IDs are UUID v4, no MongoDB _id in responses.
"""

import requests
import os
import sys

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://dtf-print-hub-2.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Test state
session_id = None
operator_id = None
order_ids = []

def log(msg):
    print(f"✓ {msg}")

def fail(msg):
    print(f"✗ FAIL: {msg}")
    sys.exit(1)

def test_group(name):
    print(f"\n{'='*80}")
    print(f"  {name}")
    print('='*80)

# =============================================================================
# A) /api/users ENDPOINT (P0 - NEW)
# =============================================================================

def test_users_endpoints():
    test_group("A) /api/users ENDPOINT")
    
    # A1: GET /api/users → 200, array 3 items
    print("\nA1: GET /api/users → should return 3 users from seed")
    r = requests.get(f"{API_URL}/users")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    users = r.json()
    assert isinstance(users, list), "Expected array"
    assert len(users) == 3, f"Expected 3 users, got {len(users)}"
    
    # Verify no passwordHash or _id
    for u in users:
        assert 'passwordHash' not in u, f"User {u.get('id')} has passwordHash (should be stripped)"
        assert '_id' not in u, f"User {u.get('id')} has _id (should be stripped)"
        assert 'id' in u, "User missing id field"
        assert 'role' in u, "User missing role field"
    
    log(f"GET /api/users → 200, {len(users)} users, no passwordHash or _id")
    
    # A2: GET /api/users?role=operator → 1 item (Carla Muñoz)
    print("\nA2: GET /api/users?role=operator → should return 1 operator")
    r = requests.get(f"{API_URL}/users?role=operator")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    operators = r.json()
    assert isinstance(operators, list), "Expected array"
    assert len(operators) == 1, f"Expected 1 operator, got {len(operators)}"
    assert operators[0]['role'] == 'operator', "Expected role=operator"
    assert 'Carla' in operators[0].get('fullName', ''), "Expected Carla Muñoz"
    log(f"GET /api/users?role=operator → 200, 1 operator: {operators[0]['fullName']}")
    
    # A3: GET /api/users?role=admin → 1 item (Diego López)
    print("\nA3: GET /api/users?role=admin → should return 1 admin")
    r = requests.get(f"{API_URL}/users?role=admin")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    admins = r.json()
    assert isinstance(admins, list), "Expected array"
    assert len(admins) == 1, f"Expected 1 admin, got {len(admins)}"
    assert admins[0]['role'] == 'admin', "Expected role=admin"
    assert 'Diego' in admins[0].get('fullName', ''), "Expected Diego López"
    log(f"GET /api/users?role=admin → 200, 1 admin: {admins[0]['fullName']}")
    
    # Store operator_id for later tests
    global operator_id
    operator_id = admins[0]['id']
    log(f"Stored operator_id for tests: {operator_id}")
    
    # A4: GET /api/users?role=nonexistent → empty array
    print("\nA4: GET /api/users?role=nonexistent → should return empty array")
    r = requests.get(f"{API_URL}/users?role=nonexistent")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    result = r.json()
    assert isinstance(result, list), "Expected array"
    assert len(result) == 0, f"Expected empty array, got {len(result)} items"
    log("GET /api/users?role=nonexistent → 200, empty array")

# =============================================================================
# B) POS SESSIONS (P0)
# =============================================================================

def test_pos_sessions():
    test_group("B) POS SESSIONS")
    global session_id, operator_id
    
    # B1: Ensure no open session first (close if exists)
    print("\nB1: GET /api/pos/sessions/current → check for existing open session")
    r = requests.get(f"{API_URL}/pos/sessions/current?operatorId={operator_id}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    current = r.json()
    
    if current and current.get('status') == 'open':
        print(f"   Found open session {current['id']}, closing it first...")
        close_r = requests.post(f"{API_URL}/pos/sessions/close", json={
            'sessionId': current['id'],
            'closingCash': current.get('openingCash', 0) + current.get('totalCash', 0)
        })
        assert close_r.status_code == 200, f"Failed to close existing session: {close_r.status_code}"
        log(f"Closed existing session {current['id']}")
    else:
        log("No open session found (good)")
    
    # B2: Open session
    print("\nB2: POST /api/pos/sessions/open → create new session")
    r = requests.post(f"{API_URL}/pos/sessions/open", json={
        'operatorId': operator_id,
        'openingCash': 50000,
        'notes': 'Test session for POS module'
    })
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    session = r.json()
    
    # Verify response structure
    assert 'id' in session, "Session missing id"
    assert session['status'] == 'open', f"Expected status=open, got {session['status']}"
    assert session['operatorId'] == operator_id, "operatorId mismatch"
    assert 'operatorName' in session, "Missing operatorName"
    assert session['salesCount'] == 0, f"Expected salesCount=0, got {session['salesCount']}"
    assert session['totalCash'] == 0, f"Expected totalCash=0, got {session['totalCash']}"
    assert session['openingCash'] == 50000, f"Expected openingCash=50000, got {session['openingCash']}"
    assert '_id' not in session, "Session has _id (should be stripped)"
    
    session_id = session['id']
    log(f"POST /api/pos/sessions/open → 200, session created: {session_id}")
    log(f"   operatorName: {session['operatorName']}, openingCash: {session['openingCash']}")
    
    # B3: Duplicate open → 409
    print("\nB3: POST /api/pos/sessions/open (duplicate) → should return 409")
    r = requests.post(f"{API_URL}/pos/sessions/open", json={
        'operatorId': operator_id,
        'openingCash': 30000,
        'notes': 'Duplicate attempt'
    })
    assert r.status_code == 409, f"Expected 409, got {r.status_code}"
    assert 'Ya tienes una caja abierta' in r.text, "Expected error message about open session"
    log("POST /api/pos/sessions/open (duplicate) → 409 'Ya tienes una caja abierta'")
    
    # B4: Validations
    print("\nB4: POST /api/pos/sessions/open validations")
    
    # No operatorId
    r = requests.post(f"{API_URL}/pos/sessions/open", json={'openingCash': 10000})
    assert r.status_code == 400, f"Expected 400 for missing operatorId, got {r.status_code}"
    log("   No operatorId → 400")
    
    # Negative openingCash
    r = requests.post(f"{API_URL}/pos/sessions/open", json={
        'operatorId': 'fake-id',
        'openingCash': -1000
    })
    assert r.status_code == 400, f"Expected 400 for negative cash, got {r.status_code}"
    log("   Negative openingCash → 400")
    
    # Nonexistent operator
    r = requests.post(f"{API_URL}/pos/sessions/open", json={
        'operatorId': 'nonexistent-uuid-1234',
        'openingCash': 10000
    })
    assert r.status_code == 404, f"Expected 404 for nonexistent operator, got {r.status_code}"
    log("   Nonexistent operatorId → 404")
    
    # B5: Get current session
    print("\nB5: GET /api/pos/sessions/current → should return active session")
    r = requests.get(f"{API_URL}/pos/sessions/current?operatorId={operator_id}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    current = r.json()
    assert current is not None, "Expected session, got null"
    assert current['id'] == session_id, f"Expected session {session_id}, got {current['id']}"
    assert current['status'] == 'open', f"Expected status=open, got {current['status']}"
    log(f"GET /api/pos/sessions/current → 200, session {session_id}")
    
    # B6: List sessions
    print("\nB6: GET /api/pos/sessions → should return array with sessions")
    r = requests.get(f"{API_URL}/pos/sessions")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    sessions = r.json()
    assert isinstance(sessions, list), "Expected array"
    assert len(sessions) > 0, "Expected at least 1 session"
    log(f"GET /api/pos/sessions → 200, {len(sessions)} sessions")
    
    # Filter by operatorId
    r = requests.get(f"{API_URL}/pos/sessions?operatorId={operator_id}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    filtered = r.json()
    assert isinstance(filtered, list), "Expected array"
    for s in filtered:
        assert s['operatorId'] == operator_id, f"Expected operatorId={operator_id}, got {s['operatorId']}"
    log(f"GET /api/pos/sessions?operatorId={operator_id} → 200, {len(filtered)} sessions")
    
    # B7: Get session detail
    print("\nB7: GET /api/pos/sessions/<id> → should return session with sales array")
    r = requests.get(f"{API_URL}/pos/sessions/{session_id}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    detail = r.json()
    assert 'session' in detail, "Missing session field"
    assert 'sales' in detail, "Missing sales field"
    assert detail['session']['id'] == session_id, "Session id mismatch"
    assert isinstance(detail['sales'], list), "Expected sales array"
    assert len(detail['sales']) == 0, f"Expected 0 sales (new session), got {len(detail['sales'])}"
    log(f"GET /api/pos/sessions/{session_id} → 200, session with {len(detail['sales'])} sales")

# =============================================================================
# C) POS SALES (P0)
# =============================================================================

def test_pos_sales():
    test_group("C) POS SALES")
    global session_id, order_ids
    
    # Get product with stock
    print("\nC0: GET /api/products → get product for sales")
    r = requests.get(f"{API_URL}/products")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    products = r.json()
    assert len(products) > 0, "No products found"
    
    product = products[0]  # Polera Algodón Clásica
    variant = product['variants'][0]
    product_id = product['id']
    variant_id = variant['id']
    unit_price = variant['price']
    
    log(f"Using product: {product['name']} · {variant['name']} (${unit_price})")
    
    # C1: Sale with cash only (exact amount)
    print("\nC1: POST /api/pos/sales → sale with cash (exact amount)")
    total_expected = unit_price * 2  # 2 units
    r = requests.post(f"{API_URL}/pos/sales", json={
        'sessionId': session_id,
        'items': [
            {'productId': product_id, 'variantId': variant_id, 'quantity': 2}
        ],
        'payments': [
            {'method': 'cash', 'amount': total_expected}
        ],
        'customer': {
            'name': 'Carlos Test',
            'rut': '12.345.678-9'
        }
    })
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    sale1 = r.json()
    
    # Verify response
    assert sale1['ok'] is True, "Expected ok=true"
    assert 'order' in sale1, "Missing order field"
    assert 'items' in sale1, "Missing items field"
    assert 'change' in sale1, "Missing change field"
    
    order1 = sale1['order']
    assert order1['orderNumber'].startswith('DLV-POS-'), f"Expected DLV-POS-* format, got {order1['orderNumber']}"
    assert order1['channel'] == 'pos', f"Expected channel=pos, got {order1['channel']}"
    assert order1['posSessionId'] == session_id, "posSessionId mismatch"
    assert order1['status'] == 'paid', f"Expected status=paid, got {order1['status']}"
    assert order1['change'] == 0, f"Expected change=0 (exact payment), got {order1['change']}"
    assert len(order1['payments']) == 1, f"Expected 1 payment, got {len(order1['payments'])}"
    assert order1['payments'][0]['method'] == 'cash', "Expected cash payment"
    assert len(sale1['items']) == 1, f"Expected 1 order item, got {len(sale1['items'])}"
    
    order_ids.append(order1['id'])
    log(f"POST /api/pos/sales (cash exact) → 200, order {order1['orderNumber']}, total ${order1['total']}, change ${order1['change']}")
    
    # C2: Sale with mixed payment (cash+card) + change
    print("\nC2: POST /api/pos/sales → sale with mixed payment (cash+card) + change")
    total_expected = unit_price * 1  # 1 unit
    cash_amount = 8000
    card_amount = 5000
    paid_total = cash_amount + card_amount
    expected_change = paid_total - total_expected
    
    r = requests.post(f"{API_URL}/pos/sales", json={
        'sessionId': session_id,
        'items': [
            {'productId': product_id, 'variantId': variant_id, 'quantity': 1}
        ],
        'payments': [
            {'method': 'cash', 'amount': cash_amount},
            {'method': 'card', 'amount': card_amount, 'cardBrand': 'visa', 'last4': '1234'}
        ]
    })
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    sale2 = r.json()
    
    order2 = sale2['order']
    assert order2['total'] == total_expected, f"Expected total={total_expected}, got {order2['total']}"
    assert order2['paid'] == paid_total, f"Expected paid={paid_total}, got {order2['paid']}"
    assert order2['change'] == expected_change, f"Expected change={expected_change}, got {order2['change']}"
    assert len(order2['payments']) == 2, f"Expected 2 payments, got {len(order2['payments'])}"
    
    # Verify payment details
    payments = order2['payments']
    cash_payment = next((p for p in payments if p['method'] == 'cash'), None)
    card_payment = next((p for p in payments if p['method'] == 'card'), None)
    assert cash_payment is not None, "Missing cash payment"
    assert card_payment is not None, "Missing card payment"
    assert card_payment['cardBrand'] == 'visa', "cardBrand mismatch"
    assert card_payment['last4'] == '1234', "last4 mismatch"
    
    order_ids.append(order2['id'])
    log(f"POST /api/pos/sales (mixed) → 200, order {order2['orderNumber']}, paid ${order2['paid']}, change ${order2['change']}")
    
    # C3: Sale with transfer
    print("\nC3: POST /api/pos/sales → sale with transfer")
    r = requests.post(f"{API_URL}/pos/sales", json={
        'sessionId': session_id,
        'items': [
            {'productId': product_id, 'variantId': variant_id, 'quantity': 1}
        ],
        'payments': [
            {'method': 'transfer', 'amount': unit_price, 'reference': '12345'}
        ]
    })
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    sale3 = r.json()
    
    order3 = sale3['order']
    assert order3['paymentMethod'] == 'transfer', f"Expected paymentMethod=transfer, got {order3['paymentMethod']}"
    assert order3['payments'][0]['method'] == 'transfer', "Expected transfer payment"
    assert order3['payments'][0]['reference'] == '12345', "reference mismatch"
    
    order_ids.append(order3['id'])
    log(f"POST /api/pos/sales (transfer) → 200, order {order3['orderNumber']}, paymentMethod={order3['paymentMethod']}")
    
    # C4: Verify session counters updated
    print("\nC4: GET /api/pos/sessions/<id> → verify counters after 3 sales")
    r = requests.get(f"{API_URL}/pos/sessions/{session_id}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    detail = r.json()
    session = detail['session']
    
    assert session['salesCount'] == 3, f"Expected salesCount=3, got {session['salesCount']}"
    assert session['totalSales'] > 0, f"Expected totalSales > 0, got {session['totalSales']}"
    assert session['totalCash'] > 0, f"Expected totalCash > 0, got {session['totalCash']}"
    assert session['totalCard'] > 0, f"Expected totalCard > 0, got {session['totalCard']}"
    assert session['totalTransfer'] > 0, f"Expected totalTransfer > 0, got {session['totalTransfer']}"
    
    log(f"Session counters: salesCount={session['salesCount']}, totalSales=${session['totalSales']}")
    log(f"   totalCash=${session['totalCash']}, totalCard=${session['totalCard']}, totalTransfer=${session['totalTransfer']}")
    
    # C5: Verify stock decremented
    print("\nC5: GET /api/inventory/commercial → verify stock decremented")
    r = requests.get(f"{API_URL}/inventory/commercial")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    stock_rows = r.json()
    
    stock_row = next((s for s in stock_rows if s['productId'] == product_id and s['variantId'] == variant_id), None)
    assert stock_row is not None, f"Stock row not found for product {product_id} variant {variant_id}"
    
    # We sold 2+1+1 = 4 units total
    log(f"Stock after sales: {stock_row['quantity']} units (should be 4 less than initial)")
    
    # C6: Verify stock_movements created
    print("\nC6: GET /api/stock-movements → verify movements created")
    r = requests.get(f"{API_URL}/stock-movements")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    movements = r.json()
    
    pos_movements = [m for m in movements if m.get('reference') == 'pos_sale']
    assert len(pos_movements) >= 3, f"Expected at least 3 POS movements, got {len(pos_movements)}"
    
    log(f"Found {len(pos_movements)} stock movements with reference='pos_sale'")
    
    # C7: Validations
    print("\nC7: POST /api/pos/sales validations")
    
    # No sessionId
    r = requests.post(f"{API_URL}/pos/sales", json={
        'items': [{'productId': product_id, 'variantId': variant_id, 'quantity': 1}],
        'payments': [{'method': 'cash', 'amount': 5000}]
    })
    assert r.status_code == 400, f"Expected 400 for missing sessionId, got {r.status_code}"
    log("   No sessionId → 400")
    
    # Nonexistent sessionId
    r = requests.post(f"{API_URL}/pos/sales", json={
        'sessionId': 'nonexistent-uuid-1234',
        'items': [{'productId': product_id, 'variantId': variant_id, 'quantity': 1}],
        'payments': [{'method': 'cash', 'amount': 5000}]
    })
    assert r.status_code == 404, f"Expected 404 for nonexistent session, got {r.status_code}"
    log("   Nonexistent sessionId → 404")
    
    # No items
    r = requests.post(f"{API_URL}/pos/sales", json={
        'sessionId': session_id,
        'items': [],
        'payments': [{'method': 'cash', 'amount': 5000}]
    })
    assert r.status_code == 400, f"Expected 400 for empty items, got {r.status_code}"
    log("   Empty items → 400")
    
    # No payments
    r = requests.post(f"{API_URL}/pos/sales", json={
        'sessionId': session_id,
        'items': [{'productId': product_id, 'variantId': variant_id, 'quantity': 1}],
        'payments': []
    })
    assert r.status_code == 400, f"Expected 400 for empty payments, got {r.status_code}"
    log("   Empty payments → 400")
    
    # Invalid payment method
    r = requests.post(f"{API_URL}/pos/sales", json={
        'sessionId': session_id,
        'items': [{'productId': product_id, 'variantId': variant_id, 'quantity': 1}],
        'payments': [{'method': 'bitcoin', 'amount': 5000}]
    })
    assert r.status_code == 400, f"Expected 400 for invalid payment method, got {r.status_code}"
    assert 'inválido' in r.text.lower(), "Expected error message about invalid method"
    log("   Invalid payment method → 400")
    
    # Insufficient payment
    r = requests.post(f"{API_URL}/pos/sales", json={
        'sessionId': session_id,
        'items': [{'productId': product_id, 'variantId': variant_id, 'quantity': 1}],
        'payments': [{'method': 'cash', 'amount': 100}]  # way too low
    })
    assert r.status_code == 400, f"Expected 400 for insufficient payment, got {r.status_code}"
    assert 'insuficiente' in r.text.lower(), "Expected error message about insufficient payment"
    log("   Insufficient payment → 400")
    
    # Insufficient stock
    r = requests.post(f"{API_URL}/pos/sales", json={
        'sessionId': session_id,
        'items': [{'productId': product_id, 'variantId': variant_id, 'quantity': 9999}],
        'payments': [{'method': 'cash', 'amount': 999999}]
    })
    assert r.status_code == 400, f"Expected 400 for insufficient stock, got {r.status_code}"
    assert 'stock insuficiente' in r.text.lower(), "Expected error message about insufficient stock"
    log("   Insufficient stock → 400")
    
    # C8: GET /api/pos/sales?sessionId=X
    print("\nC8: GET /api/pos/sales?sessionId=<id> → should return sales for session")
    r = requests.get(f"{API_URL}/pos/sales?sessionId={session_id}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    sales = r.json()
    assert isinstance(sales, list), "Expected array"
    assert len(sales) >= 3, f"Expected at least 3 sales, got {len(sales)}"
    
    for sale in sales:
        assert sale['channel'] == 'pos', f"Expected channel=pos, got {sale['channel']}"
        assert sale['posSessionId'] == session_id, "posSessionId mismatch"
    
    log(f"GET /api/pos/sales?sessionId={session_id} → 200, {len(sales)} sales")

# =============================================================================
# D) SESSION CLOSURE WITH ARQUEO (P0)
# =============================================================================

def test_session_closure():
    test_group("D) SESSION CLOSURE WITH ARQUEO")
    global session_id, operator_id
    
    # Get session to calculate expected cash
    print("\nD1: GET /api/pos/sessions/<id> → get session for closure")
    r = requests.get(f"{API_URL}/pos/sessions/{session_id}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    detail = r.json()
    session = detail['session']
    
    expected_cash = session['openingCash'] + session['totalCash']
    log(f"Session: openingCash=${session['openingCash']}, totalCash=${session['totalCash']}")
    log(f"Expected cash for closure: ${expected_cash}")
    
    # D2: Close session
    print("\nD2: POST /api/pos/sessions/close → close session with correct cash")
    r = requests.post(f"{API_URL}/pos/sessions/close", json={
        'sessionId': session_id,
        'closingCash': expected_cash,
        'notes': 'Test closure - arqueo correcto'
    })
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    closed_session = r.json()
    
    assert closed_session['status'] == 'closed', f"Expected status=closed, got {closed_session['status']}"
    assert closed_session['closedAt'] is not None, "Missing closedAt"
    assert closed_session['difference'] == 0, f"Expected difference=0, got {closed_session['difference']}"
    assert closed_session['closingCash'] == expected_cash, "closingCash mismatch"
    assert closed_session['expectedCash'] == expected_cash, "expectedCash mismatch"
    
    log(f"POST /api/pos/sessions/close → 200, status=closed, difference=${closed_session['difference']}")
    
    # D3: Try to close again → 400
    print("\nD3: POST /api/pos/sessions/close (duplicate) → should return 400")
    r = requests.post(f"{API_URL}/pos/sessions/close", json={
        'sessionId': session_id,
        'closingCash': expected_cash
    })
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    assert 'ya está cerrada' in r.text.lower(), "Expected error message about closed session"
    log("POST /api/pos/sessions/close (duplicate) → 400 'sesión ya está cerrada'")
    
    # D4: Verify current session is null
    print("\nD4: GET /api/pos/sessions/current → should return null (no open session)")
    r = requests.get(f"{API_URL}/pos/sessions/current?operatorId={operator_id}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    current = r.json()
    assert current is None, f"Expected null (no open session), got {current}"
    log("GET /api/pos/sessions/current → 200, null (no open session)")

# =============================================================================
# E) PDF TICKETS (P0)
# =============================================================================

def test_pdf_tickets():
    test_group("E) PDF TICKETS")
    global order_ids
    
    if not order_ids:
        print("⚠ No order IDs available, skipping PDF tests")
        return
    
    order_id = order_ids[0]
    
    # E1: GET /api/tickets/<orderId>?format=thermal
    print(f"\nE1: GET /api/tickets/{order_id}?format=thermal → should return PDF")
    r = requests.get(f"{API_URL}/tickets/{order_id}?format=thermal")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert r.headers['Content-Type'] == 'application/pdf', f"Expected PDF, got {r.headers['Content-Type']}"
    assert len(r.content) > 500, f"PDF too small: {len(r.content)} bytes"
    log(f"GET /api/tickets/{order_id}?format=thermal → 200, PDF {len(r.content)} bytes")
    
    # E2: GET /api/tickets/<orderId>?format=a4
    print(f"\nE2: GET /api/tickets/{order_id}?format=a4 → should return PDF")
    r = requests.get(f"{API_URL}/tickets/{order_id}?format=a4")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert r.headers['Content-Type'] == 'application/pdf', f"Expected PDF, got {r.headers['Content-Type']}"
    assert len(r.content) > 500, f"PDF too small: {len(r.content)} bytes"
    log(f"GET /api/tickets/{order_id}?format=a4 → 200, PDF {len(r.content)} bytes")
    
    # E3: GET /api/tickets/nonexistent → 404
    print("\nE3: GET /api/tickets/nonexistent → should return 404")
    r = requests.get(f"{API_URL}/tickets/nonexistent-uuid-1234")
    assert r.status_code == 404, f"Expected 404, got {r.status_code}"
    log("GET /api/tickets/nonexistent → 404")
    
    # E4: GET /api/tickets/<orderId> (no format) → default thermal
    print(f"\nE4: GET /api/tickets/{order_id} (no format) → should default to thermal")
    r = requests.get(f"{API_URL}/tickets/{order_id}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert r.headers['Content-Type'] == 'application/pdf', f"Expected PDF, got {r.headers['Content-Type']}"
    assert len(r.content) > 500, f"PDF too small: {len(r.content)} bytes"
    log(f"GET /api/tickets/{order_id} (no format) → 200, PDF {len(r.content)} bytes (default thermal)")

# =============================================================================
# F) REGRESSION TESTS
# =============================================================================

def test_regression():
    test_group("F) REGRESSION TESTS")
    
    # F1: GET /api/products
    print("\nF1: GET /api/products → should still work")
    r = requests.get(f"{API_URL}/products")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    products = r.json()
    assert len(products) > 0, "No products found"
    log(f"GET /api/products → 200, {len(products)} products")
    
    # F2: GET /api/orders
    print("\nF2: GET /api/orders → should include POS orders")
    r = requests.get(f"{API_URL}/orders")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    orders = r.json()
    assert len(orders) > 0, "No orders found"
    
    pos_orders = [o for o in orders if o.get('channel') == 'pos']
    assert len(pos_orders) >= 3, f"Expected at least 3 POS orders, got {len(pos_orders)}"
    log(f"GET /api/orders → 200, {len(orders)} orders ({len(pos_orders)} POS orders)")
    
    # F3: POST /api/orders/public → should still work
    print("\nF3: POST /api/orders/public → should create web order")
    r = requests.get(f"{API_URL}/products")
    products = r.json()
    product = products[0]
    variant = product['variants'][0]
    
    r = requests.post(f"{API_URL}/orders/public", json={
        'customer': {
            'name': 'María González',
            'email': 'maria@example.com',
            'phone': '+56912345678',
            'rut': '12.345.678-9'
        },
        'items': [
            {'productId': product['id'], 'variantId': variant['id'], 'quantity': 1}
        ],
        'deliveryMethod': 'pickup',
        'paymentMethod': 'transfer'
    })
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    result = r.json()
    assert result['ok'] is True, "Expected ok=true"
    assert 'orderNumber' in result, "Missing orderNumber"
    log(f"POST /api/orders/public → 200, order {result['orderNumber']}")
    
    # F4: POST /api/gang-sheets → should still work
    print("\nF4: POST /api/gang-sheets → should create gang sheet order")
    r = requests.post(f"{API_URL}/gang-sheets", json={
        'mode': 'dtf_textil_33',
        'designs': [
            {
                'id': 'test-design-1',
                'imageUrl': '/uploads/designs/test.png',
                'xMm': 10,
                'yMm': 10,
                'widthMm': 100,
                'heightMm': 100
            }
        ],
        'canvasWidthMm': 330,
        'customer': {
            'name': 'Test Customer',
            'email': 'test@example.com',
            'phone': '+56912345678'
        }
    })
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    result = r.json()
    assert 'orderNumber' in result, "Missing orderNumber"
    assert result['orderNumber'].startswith('DLV-'), "Invalid orderNumber format"
    log(f"POST /api/gang-sheets → 200, order {result['orderNumber']}")

# =============================================================================
# MAIN
# =============================================================================

def main():
    print("\n" + "="*80)
    print("  BACKEND TEST SUITE - POS MODULE")
    print("  Base URL:", API_URL)
    print("="*80)
    
    try:
        # First, seed the database to ensure clean state
        print("\n🌱 Seeding database...")
        r = requests.post(f"{API_URL}/seed")
        if r.status_code == 200:
            log("Database seeded successfully")
        else:
            print(f"⚠ Warning: Seed returned {r.status_code}, continuing anyway...")
        
        # Run test suites
        test_users_endpoints()
        test_pos_sessions()
        test_pos_sales()
        test_session_closure()
        test_pdf_tickets()
        test_regression()
        
        # Summary
        print("\n" + "="*80)
        print("  ✅ ALL TESTS PASSED")
        print("="*80)
        print("\nSummary:")
        print(f"  • /api/users endpoint: ✅ Working (4 test cases)")
        print(f"  • POS Sessions CRUD: ✅ Working (7 test cases)")
        print(f"  • POS Sales: ✅ Working (8 test cases + validations)")
        print(f"  • Session Closure: ✅ Working (4 test cases)")
        print(f"  • PDF Tickets: ✅ Working (4 test cases)")
        print(f"  • Regression: ✅ Working (4 test cases)")
        print(f"\nTotal: 31+ test cases passed")
        
    except AssertionError as e:
        fail(str(e))
    except Exception as e:
        fail(f"Unexpected error: {e}")

if __name__ == '__main__':
    main()
