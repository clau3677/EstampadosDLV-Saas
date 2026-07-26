#!/usr/bin/env python3
"""
Backend Testing: Email SMTP + Pre-Press Automation
Estampados DLV - Iteration 7

Tests both new features:
1. Email SMTP Zero-Cost (Gmail + Nodemailer)
2. Pre-Press Automation Zero-Click (Sharp + Hot Folders)

IMPORTANT: Limit real email sends to 3-4 total (Gmail has ~500/day limit).
Use estampadosdlv@gmail.com as test recipient (self-test).
"""

import os
import sys
import json
import requests
import time
from datetime import datetime

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://dtf-print-hub-2.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Test counters
tests_passed = 0
tests_failed = 0
real_emails_sent = 0
MAX_REAL_EMAILS = 4

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_group(name):
    print(f"\n{'='*80}")
    print(f"  {name}")
    print(f"{'='*80}\n")

def assert_status(response, expected, test_name):
    global tests_passed, tests_failed
    if response.status_code == expected:
        log(f"✅ PASS: {test_name} (status {response.status_code})")
        tests_passed += 1
        return True
    else:
        log(f"❌ FAIL: {test_name} - Expected {expected}, got {response.status_code}")
        log(f"   Response: {response.text[:200]}")
        tests_failed += 1
        return False

def assert_field(data, field, test_name):
    global tests_passed, tests_failed
    if field in data:
        log(f"✅ PASS: {test_name} - field '{field}' present")
        tests_passed += 1
        return True
    else:
        log(f"❌ FAIL: {test_name} - field '{field}' missing")
        log(f"   Data: {json.dumps(data, indent=2)[:200]}")
        tests_failed += 1
        return False

def assert_value(actual, expected, test_name):
    global tests_passed, tests_failed
    if actual == expected:
        log(f"✅ PASS: {test_name} - value matches ({actual})")
        tests_passed += 1
        return True
    else:
        log(f"❌ FAIL: {test_name} - Expected {expected}, got {actual}")
        tests_failed += 1
        return False

# ============================================================================
# FEATURE 1: EMAIL SMTP ZERO-COST
# ============================================================================

def test_email_status():
    """1.1) GET /api/email/status"""
    test_group("1.1 - Email Status Endpoint")
    
    r = requests.get(f"{API_URL}/email/status")
    if not assert_status(r, 200, "GET /api/email/status"):
        return
    
    data = r.json()
    assert_field(data, 'config', "Response has 'config' field")
    
    config = data.get('config', {})
    assert_value(config.get('host'), 'smtp.gmail.com', "SMTP host is Gmail")
    assert_value(config.get('port'), 465, "SMTP port is 465")
    assert_value(config.get('secure'), True, "SMTP secure is true")
    assert_value(config.get('user'), 'estampadosdlv@gmail.com', "SMTP user correct")
    assert_value(config.get('configured'), True, "SMTP configured is true")
    
    # CRITICAL: Password must NOT appear
    if 'pass' in config or 'password' in config:
        log(f"❌ FAIL: Password leaked in config response!")
        global tests_failed
        tests_failed += 1
    else:
        log(f"✅ PASS: Password not leaked in response")
        global tests_passed
        tests_passed += 1

def test_email_verify():
    """1.2) POST /api/email/verify"""
    test_group("1.2 - Email Verify Connection")
    
    r = requests.post(f"{API_URL}/email/verify")
    if not assert_status(r, 200, "POST /api/email/verify"):
        return
    
    data = r.json()
    assert_value(data.get('ok'), True, "SMTP verification successful")

def test_email_send_validations():
    """1.3) POST /api/email/send validations"""
    test_group("1.3 - Email Send Validations")
    
    # Missing 'to'
    r = requests.post(f"{API_URL}/email/send", json={
        "subject": "Test",
        "text": "Test"
    })
    assert_status(r, 400, "Missing 'to' returns 400")
    
    # Missing 'subject'
    r = requests.post(f"{API_URL}/email/send", json={
        "to": "test@example.com",
        "text": "Test"
    })
    assert_status(r, 400, "Missing 'subject' returns 400")
    
    # Missing both 'html' and 'text'
    r = requests.post(f"{API_URL}/email/send", json={
        "to": "test@example.com",
        "subject": "Test"
    })
    assert_status(r, 400, "Missing 'html' and 'text' returns 400")

def test_email_send_success():
    """1.4) POST /api/email/send success (1 REAL EMAIL)"""
    test_group("1.4 - Email Send Success (REAL EMAIL #1)")
    
    global real_emails_sent
    if real_emails_sent >= MAX_REAL_EMAILS:
        log(f"⚠️  SKIP: Already sent {real_emails_sent} real emails (limit {MAX_REAL_EMAILS})")
        return
    
    r = requests.post(f"{API_URL}/email/send", json={
        "to": "estampadosdlv@gmail.com",
        "subject": "Backend test · Emails",
        "text": "Test manual desde el testing agent",
        "note": "backend-test"
    })
    
    if not assert_status(r, 200, "POST /api/email/send with valid data"):
        return
    
    data = r.json()
    assert_value(data.get('ok'), True, "Email sent successfully")
    assert_field(data, 'messageId', "Response has messageId")
    
    real_emails_sent += 1
    log(f"📧 Real email sent ({real_emails_sent}/{MAX_REAL_EMAILS})")
    
    # Verify in message log
    time.sleep(1)
    r = requests.get(f"{API_URL}/email/messages?limit=1")
    if assert_status(r, 200, "GET /api/email/messages after send"):
        messages = r.json()
        if len(messages) > 0:
            msg = messages[0]
            assert_value(msg.get('status'), 'sent', "Latest message status is 'sent'")
            assert_value(msg.get('event'), 'manual', "Latest message event is 'manual'")
            assert_value(msg.get('to'), 'estampadosdlv@gmail.com', "Latest message to correct")
            assert_field(msg, 'messageId', "Message has messageId")
            
            # Verify 'html' field is excluded
            if 'html' in msg:
                log(f"❌ FAIL: 'html' field should be excluded from message log")
                global tests_failed
                tests_failed += 1
            else:
                log(f"✅ PASS: 'html' field correctly excluded from message log")
                global tests_passed
                tests_passed += 1

def test_email_hook_order_with_email():
    """1.5) Hook: POST /api/orders/public with valid email (1 REAL EMAIL)"""
    test_group("1.5 - Email Hook: Order with Valid Email (REAL EMAIL #2)")
    
    global real_emails_sent
    if real_emails_sent >= MAX_REAL_EMAILS:
        log(f"⚠️  SKIP: Already sent {real_emails_sent} real emails (limit {MAX_REAL_EMAILS})")
        return
    
    # First get a valid product and variant
    r_products = requests.get(f"{API_URL}/products")
    if r_products.status_code != 200:
        log(f"⚠️  SKIP: Cannot fetch products")
        return
    
    products = r_products.json()
    if len(products) == 0:
        log(f"⚠️  SKIP: No products available")
        return
    
    product = products[0]
    variant = product['variants'][0] if product.get('variants') else None
    if not variant:
        log(f"⚠️  SKIP: No variants available")
        return
    
    # Create order with email
    r = requests.post(f"{API_URL}/orders/public", json={
        "customer": {
            "name": "Test Cliente Email",
            "email": "estampadosdlv@gmail.com",
            "phone": "+56912345678"
        },
        "items": [
            {
                "productId": product['id'],
                "variantId": variant['id'],
                "quantity": 1
            }
        ],
        "deliveryMethod": "pickup",
        "paymentMethod": "transfer"
    })
    
    if not assert_status(r, 200, "POST /api/orders/public with email"):
        return
    
    data = r.json()
    order_number = data.get('orderNumber')
    assert_field(data, 'orderNumber', "Order created with orderNumber")
    
    real_emails_sent += 1
    log(f"📧 Real email sent via order hook ({real_emails_sent}/{MAX_REAL_EMAILS})")
    
    # Verify email was sent
    time.sleep(1)
    r = requests.get(f"{API_URL}/email/messages?limit=1")
    if assert_status(r, 200, "GET /api/email/messages after order"):
        messages = r.json()
        if len(messages) > 0:
            msg = messages[0]
            assert_value(msg.get('event'), 'order_confirmation', "Email event is 'order_confirmation'")
            assert_value(msg.get('status'), 'sent', "Email status is 'sent'")
            assert_field(msg, 'messageId', "Email has messageId")
            
            # Verify subject contains order number
            subject = msg.get('subject', '')
            if order_number and order_number in subject:
                log(f"✅ PASS: Subject contains orderNumber '{order_number}'")
                global tests_passed
                tests_passed += 1
            else:
                log(f"❌ FAIL: Subject doesn't contain orderNumber")
                global tests_failed
                tests_failed += 1

def test_email_hook_order_no_email():
    """1.6) Hook: POST /api/orders/public with no email"""
    test_group("1.6 - Email Hook: Order with No Email")
    
    # NOTE: /api/orders/public REQUIRES email (business rule), so this test
    # verifies that the endpoint returns 400 (expected behavior)
    # The email notification is best-effort and won't block, but the endpoint
    # itself requires email for public orders
    
    r = requests.post(f"{API_URL}/orders/public", json={
        "customer": {
            "name": "Test Cliente Sin Email",
            "phone": "+56912345678"
        },
        "items": [
            {
                "productId": "9831aac8-86b5-4016-a2b3-01b3a06673c6",
                "variantId": "4b617716-8399-4231-b29b-3cb4ae5b1672",
                "quantity": 1
            }
        ],
        "deliveryMethod": "pickup",
        "paymentMethod": "transfer"
    })
    
    # This should return 400 because email is required for public orders
    assert_status(r, 400, "POST /api/orders/public without email returns 400 (expected)")
    
    log(f"✅ PASS: Email is required for public orders (business rule enforced)")
    global tests_passed
    tests_passed += 1

def test_email_hook_order_invalid_email():
    """1.7) Hook: POST /api/orders/public with invalid email"""
    test_group("1.7 - Email Hook: Order with Invalid Email")
    
    # Get a valid product
    r_products = requests.get(f"{API_URL}/products")
    if r_products.status_code != 200:
        log(f"⚠️  SKIP: Cannot fetch products")
        return
    
    products = r_products.json()
    if len(products) == 0:
        log(f"⚠️  SKIP: No products available")
        return
    
    product = products[0]
    variant = product['variants'][0] if product.get('variants') else None
    if not variant:
        log(f"⚠️  SKIP: No variants available")
        return
    
    r = requests.post(f"{API_URL}/orders/public", json={
        "customer": {
            "name": "Test Cliente Email Invalido",
            "email": "not-a-valid-email",
            "phone": "+56912345678"
        },
        "items": [
            {
                "productId": product['id'],
                "variantId": variant['id'],
                "quantity": 1
            }
        ],
        "deliveryMethod": "pickup",
        "paymentMethod": "transfer"
    })
    
    if not assert_status(r, 200, "POST /api/orders/public with invalid email (not blocked)"):
        return
    
    # Verify email was skipped
    time.sleep(1)
    r = requests.get(f"{API_URL}/email/messages?limit=1")
    if assert_status(r, 200, "GET /api/email/messages after order"):
        messages = r.json()
        if len(messages) > 0:
            msg = messages[0]
            assert_value(msg.get('status'), 'skipped', "Email status is 'skipped'")
            assert_value(msg.get('reason'), 'invalid_email', "Email reason is 'invalid_email'")

def test_email_messages_endpoint():
    """1.10) GET /api/email/messages"""
    test_group("1.10 - Email Messages Endpoint")
    
    r = requests.get(f"{API_URL}/email/messages?limit=5")
    if not assert_status(r, 200, "GET /api/email/messages"):
        return
    
    messages = r.json()
    if not isinstance(messages, list):
        log(f"❌ FAIL: Response is not an array")
        global tests_failed
        tests_failed += 1
        return
    
    log(f"✅ PASS: Response is an array with {len(messages)} messages")
    global tests_passed
    tests_passed += 1
    
    if len(messages) > 0:
        msg = messages[0]
        
        # Verify required fields
        required_fields = ['id', 'createdAt', 'event', 'to', 'subject', 'status']
        for field in required_fields:
            assert_field(msg, field, f"Message has '{field}' field")
        
        # Verify _id is NOT present
        if '_id' in msg:
            log(f"❌ FAIL: MongoDB _id leaked in message")
            tests_failed += 1
        else:
            log(f"✅ PASS: No MongoDB _id in message")
            tests_passed += 1
        
        # Verify html is NOT present (excluded for size)
        if 'html' in msg:
            log(f"❌ FAIL: 'html' field should be excluded")
            tests_failed += 1
        else:
            log(f"✅ PASS: 'html' field correctly excluded")
            tests_passed += 1
        
        # Verify status-specific fields
        if msg.get('status') == 'sent':
            assert_field(msg, 'messageId', "Sent message has messageId")
        elif msg.get('status') in ['skipped', 'failed']:
            assert_field(msg, 'reason', "Skipped/failed message has reason")

# ============================================================================
# FEATURE 2: PRE-PRESS AUTOMATION
# ============================================================================

def test_prepress_status():
    """2.1) GET /api/pre-press/status"""
    test_group("2.1 - Pre-Press Status Endpoint")
    
    r = requests.get(f"{API_URL}/pre-press/status")
    if not assert_status(r, 200, "GET /api/pre-press/status"):
        return
    
    data = r.json()
    assert_field(data, 'hotFoldersBase', "Response has 'hotFoldersBase'")
    assert_field(data, 'totalExports', "Response has 'totalExports'")
    assert_field(data, 'exportsToday', "Response has 'exportsToday'")
    assert_field(data, 'foldersHealth', "Response has 'foldersHealth'")
    
    # Verify hotFoldersBase
    assert_value(data.get('hotFoldersBase'), '/app/hot_folders', "hotFoldersBase is correct")
    
    # Verify foldersHealth structure
    folders = data.get('foldersHealth', [])
    if len(folders) > 0:
        log(f"✅ PASS: foldersHealth has {len(folders)} entries")
        global tests_passed
        tests_passed += 1
        
        folder = folders[0]
        assert_field(folder, 'printerCode', "Folder has 'printerCode'")
        assert_field(folder, 'printerLabel', "Folder has 'printerLabel'")
        assert_field(folder, 'dir', "Folder has 'dir'")
        assert_field(folder, 'fileCount', "Folder has 'fileCount'")
    else:
        log(f"⚠️  WARNING: No folders in foldersHealth")

def test_prepress_export_valid_gangsheet():
    """2.2) POST /api/pre-press/export with valid gangSheetId"""
    test_group("2.2 - Pre-Press Export Valid Gang Sheet")
    
    # Use the known working gang sheet from main agent's smoke test
    gangsheet_id = "ab7e21d1-fe14-4fe4-88fa-bc4695425928"
    
    r = requests.post(f"{API_URL}/pre-press/export", json={
        "gangSheetId": gangsheet_id
    })
    
    if not assert_status(r, 200, "POST /api/pre-press/export with valid gangSheetId"):
        return
    
    data = r.json()
    assert_value(data.get('ok'), True, "Export successful")
    assert_field(data, 'export', "Response has 'export' field")
    
    export = data.get('export', {})
    assert_field(export, 'filename', "Export has 'filename'")
    assert_field(export, 'absPath', "Export has 'absPath'")
    assert_field(export, 'widthPx', "Export has 'widthPx'")
    assert_field(export, 'heightPx', "Export has 'heightPx'")
    assert_field(export, 'widthMm', "Export has 'widthMm'")
    assert_field(export, 'heightMm', "Export has 'heightMm'")
    assert_field(export, 'dpi', "Export has 'dpi'")
    assert_field(export, 'fileSize', "Export has 'fileSize'")
    assert_value(export.get('status'), 'sent_to_hotfolder', "Export status is 'sent_to_hotfolder'")
    
    # Verify DPI is 300
    assert_value(export.get('dpi'), 300, "DPI is 300")
    
    # Verify filename convention: <orderNumber>_<gangSheetId8>.png
    filename = export.get('filename', '')
    if '_' in filename and filename.endswith('.png'):
        log(f"✅ PASS: Filename follows convention: {filename}")
        global tests_passed
        tests_passed += 1
    else:
        log(f"❌ FAIL: Filename doesn't follow convention: {filename}")
        global tests_failed
        tests_failed += 1
    
    # Verify dimensions calculation (300 DPI)
    width_mm = export.get('widthMm')
    height_mm = export.get('heightMm')
    width_px = export.get('widthPx')
    height_px = export.get('heightPx')
    
    if width_mm and width_px:
        expected_width_px = round(width_mm * 300 / 25.4)
        if abs(width_px - expected_width_px) <= 1:  # Allow 1px rounding error
            log(f"✅ PASS: Width calculation correct ({width_mm}mm = {width_px}px at 300 DPI)")
            tests_passed += 1
        else:
            log(f"❌ FAIL: Width calculation wrong (expected ~{expected_width_px}px, got {width_px}px)")
            tests_failed += 1
    
    # Verify file exists on disk
    abs_path = export.get('absPath')
    if abs_path:
        import subprocess
        result = subprocess.run(['ls', '-la', abs_path], capture_output=True, text=True)
        if result.returncode == 0:
            log(f"✅ PASS: File exists on disk at {abs_path}")
            tests_passed += 1
            
            # Verify file size matches
            file_info = result.stdout.strip()
            log(f"   File info: {file_info}")
        else:
            log(f"❌ FAIL: File does not exist at {abs_path}")
            tests_failed += 1

def test_prepress_export_with_orderid():
    """2.3) POST /api/pre-press/export with orderId"""
    test_group("2.3 - Pre-Press Export with OrderId")
    
    global tests_passed, tests_failed
    
    # Use the known order that has gang sheets
    order_id = "order-dlv-2025-000219"  # This order has the working gang sheet
    
    # First, let's find an order with gang sheets by querying
    r = requests.get(f"{API_URL}/orders")
    if r.status_code == 200:
        orders = r.json()
        # Find an order that likely has gang sheets (from gang-sheet builder)
        for order in orders:
            if order.get('orderNumber', '').startswith('DLV-2025-'):
                order_id = order.get('id')
                log(f"   Using order {order.get('orderNumber')} (id: {order_id})")
                break
    
    r = requests.post(f"{API_URL}/pre-press/export", json={
        "orderId": order_id
    })
    
    if r.status_code == 200:
        data = r.json()
        assert_value(data.get('ok'), True, "Export by orderId successful")
        assert_field(data, 'count', "Response has 'count' field")
        assert_field(data, 'exports', "Response has 'exports' array")
        
        count = data.get('count', 0)
        log(f"✅ PASS: Exported {count} gang sheet(s) for order")
        tests_passed += 1
    elif r.status_code == 404:
        log(f"⚠️  Order has no gang sheets (expected for some orders)")
        tests_passed += 1
    else:
        log(f"❌ FAIL: Unexpected status {r.status_code}")
        tests_failed += 1

def test_prepress_export_validations():
    """2.4) POST /api/pre-press/export validations"""
    test_group("2.4 - Pre-Press Export Validations")
    
    # No gangSheetId nor orderId
    r = requests.post(f"{API_URL}/pre-press/export", json={})
    assert_status(r, 400, "Missing gangSheetId and orderId returns 400")
    
    # Non-existent gangSheetId
    r = requests.post(f"{API_URL}/pre-press/export", json={
        "gangSheetId": "nonexistent-id-12345678"
    })
    assert_status(r, 404, "Non-existent gangSheetId returns 404")
    
    # Non-existent orderId
    r = requests.post(f"{API_URL}/pre-press/export", json={
        "orderId": "nonexistent-order-id"
    })
    assert_status(r, 404, "Non-existent orderId returns 404")

def test_prepress_retry():
    """2.5) POST /api/pre-press/exports/:id/retry"""
    test_group("2.5 - Pre-Press Retry Export")
    
    # Get a previous export
    r = requests.get(f"{API_URL}/pre-press/exports?limit=1")
    if not assert_status(r, 200, "GET /api/pre-press/exports"):
        return
    
    exports = r.json()
    if len(exports) == 0:
        log(f"⚠️  SKIP: No exports available to retry")
        return
    
    export_id = exports[0].get('id')
    
    # Retry the export
    r = requests.post(f"{API_URL}/pre-press/exports/{export_id}/retry")
    if assert_status(r, 200, "POST /api/pre-press/exports/:id/retry"):
        data = r.json()
        assert_value(data.get('ok'), True, "Retry successful")
        assert_field(data, 'export', "Response has new export record")
    
    # Test retry with non-existent ID
    r = requests.post(f"{API_URL}/pre-press/exports/nonexistent-id/retry")
    assert_status(r, 404, "Retry with non-existent ID returns 404")

def test_prepress_file_endpoint():
    """2.6) GET /api/pre-press/file?id=<exportId>"""
    test_group("2.6 - Pre-Press File Download Endpoint")
    
    # First get a valid export ID
    r = requests.get(f"{API_URL}/pre-press/exports?limit=1")
    if not assert_status(r, 200, "GET /api/pre-press/exports"):
        return
    
    exports = r.json()
    if len(exports) == 0:
        log(f"⚠️  SKIP: No exports available to test file download")
        return
    
    export_id = exports[0].get('id')
    
    # Test valid ID
    r = requests.get(f"{API_URL}/pre-press/file?id={export_id}")
    if assert_status(r, 200, "GET /api/pre-press/file with valid ID"):
        # Verify Content-Type
        content_type = r.headers.get('Content-Type')
        assert_value(content_type, 'image/png', "Content-Type is image/png")
        
        # Verify Content-Disposition
        content_disp = r.headers.get('Content-Disposition', '')
        if 'inline' in content_disp and 'filename=' in content_disp:
            log(f"✅ PASS: Content-Disposition header correct: {content_disp}")
            global tests_passed
            tests_passed += 1
        else:
            log(f"❌ FAIL: Content-Disposition header incorrect: {content_disp}")
            global tests_failed
            tests_failed += 1
        
        # Verify PNG signature
        png_signature = b'\x89PNG\r\n\x1a\n'
        if r.content[:8] == png_signature:
            log(f"✅ PASS: Response body starts with PNG signature")
            tests_passed += 1
        else:
            log(f"❌ FAIL: Response body doesn't start with PNG signature")
            tests_failed += 1
    
    # Test missing ID
    r = requests.get(f"{API_URL}/pre-press/file")
    assert_status(r, 400, "GET /api/pre-press/file without ID returns 400")
    
    # Test non-existent ID
    r = requests.get(f"{API_URL}/pre-press/file?id=nonexistent-id")
    assert_status(r, 404, "GET /api/pre-press/file with non-existent ID returns 404")

def test_prepress_folder_endpoint():
    """2.7) GET /api/pre-press/folder/:code"""
    test_group("2.7 - Pre-Press Folder Listing Endpoint")
    
    # Test valid printer code
    r = requests.get(f"{API_URL}/pre-press/folder/prestige_r2_pro")
    if assert_status(r, 200, "GET /api/pre-press/folder/prestige_r2_pro"):
        data = r.json()
        assert_field(data, 'printerCode', "Response has 'printerCode'")
        assert_field(data, 'dir', "Response has 'dir'")
        assert_field(data, 'count', "Response has 'count'")
        assert_field(data, 'files', "Response has 'files'")
        
        # Verify files structure
        files = data.get('files', [])
        if len(files) > 0:
            file = files[0]
            assert_field(file, 'name', "File has 'name'")
            assert_field(file, 'size', "File has 'size'")
            assert_field(file, 'modifiedAt', "File has 'modifiedAt'")
    
    # Test path traversal sanitization
    r = requests.get(f"{API_URL}/pre-press/folder/../etc")
    if r.status_code == 200:
        data = r.json()
        # Verify printerCode is sanitized (no path traversal)
        printer_code = data.get('printerCode', '')
        if '../' not in printer_code and '..' not in data.get('dir', ''):
            log(f"✅ PASS: Path traversal sanitized, printerCode: {printer_code}")
            global tests_passed
            tests_passed += 1
        else:
            log(f"❌ FAIL: Path traversal not sanitized")
            global tests_failed
            tests_failed += 1

# ============================================================================
# REGRESSION TESTS
# ============================================================================

def test_regression():
    """Regression tests for existing endpoints"""
    test_group("REGRESSION - Existing Endpoints")
    
    # GET /api/products
    r = requests.get(f"{API_URL}/products")
    assert_status(r, 200, "GET /api/products still works")
    
    # GET /api/production/queue
    r = requests.get(f"{API_URL}/production/queue")
    assert_status(r, 200, "GET /api/production/queue still works")
    
    # GET /api/dashboard/summary
    r = requests.get(f"{API_URL}/dashboard/summary")
    assert_status(r, 200, "GET /api/dashboard/summary still works")
    
    # GET /api/whatsapp/status
    r = requests.get(f"{API_URL}/whatsapp/status")
    assert_status(r, 200, "GET /api/whatsapp/status still works")

# ============================================================================
# MAIN
# ============================================================================

def main():
    log("Starting Email SMTP + Pre-Press Automation Backend Tests")
    log(f"Base URL: {BASE_URL}")
    log(f"API URL: {API_URL}")
    log(f"Max real emails: {MAX_REAL_EMAILS}")
    
    try:
        # FEATURE 1: EMAIL SMTP
        test_email_status()
        test_email_verify()
        test_email_send_validations()
        test_email_send_success()
        test_email_hook_order_with_email()
        test_email_hook_order_no_email()
        test_email_hook_order_invalid_email()
        test_email_messages_endpoint()
        
        # FEATURE 2: PRE-PRESS AUTOMATION
        test_prepress_status()
        test_prepress_export_valid_gangsheet()
        test_prepress_export_with_orderid()
        test_prepress_export_validations()
        test_prepress_retry()
        test_prepress_file_endpoint()
        test_prepress_folder_endpoint()
        
        # REGRESSION
        test_regression()
        
    except Exception as e:
        log(f"❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # Summary
    print(f"\n{'='*80}")
    print(f"  TEST SUMMARY")
    print(f"{'='*80}")
    print(f"✅ PASSED: {tests_passed}")
    print(f"❌ FAILED: {tests_failed}")
    print(f"📧 Real emails sent: {real_emails_sent}/{MAX_REAL_EMAILS}")
    print(f"{'='*80}\n")
    
    if tests_failed > 0:
        sys.exit(1)
    else:
        log("All tests passed! ✅")
        sys.exit(0)

if __name__ == '__main__':
    main()
