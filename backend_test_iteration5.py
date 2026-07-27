#!/usr/bin/env python3
"""
Backend Testing Suite for Estampados DLV - Iteration 5
Tests Auth + Contact Form + Uploads + Landings heroImage + Orders customerEmail filter + Middleware
"""

import requests
import json
import os
import time
from io import BytesIO
from PIL import Image

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://dtf-print-hub-2.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

print(f"🧪 Testing Iteration 5 backend at: {API_URL}\n")
print("=" * 80)

# Global variables
admin_cookie = None
test_user_email = None
created_landing_id = None
uploaded_image_url = None

# ============================================================================
# SECTION A: AUTH ENDPOINTS (PRIORITY HIGH)
# ============================================================================

print("\n📍 SECTION A: AUTH ENDPOINTS (/api/auth/*)")
print("=" * 80)

# A1: POST /api/auth/bootstrap
print("\n[A1] POST /api/auth/bootstrap - Ensure admin exists (idempotent)")
try:
    response = requests.post(f"{API_URL}/auth/bootstrap", json={}, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if data.get('ok') and data.get('adminEmail') == 'estampadosdlv@gmail.com':
            if data.get('created') == False:
                print(f"✅ PASS - Admin already exists: {data['adminEmail']}")
            else:
                print(f"✅ PASS - Admin created: {data['adminEmail']}")
        else:
            print(f"❌ FAIL - Unexpected response structure")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A2: POST /api/auth/login with correct credentials
print("\n[A2] POST /api/auth/login - Login with correct admin credentials")
try:
    response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": "estampadosdlv@gmail.com", "password": "EstampadosDLV2025!"},
        timeout=10
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        # Check Set-Cookie header
        set_cookie = response.headers.get('Set-Cookie', '')
        has_cookie = 'dlv_token=' in set_cookie and 'HttpOnly' in set_cookie and 'SameSite=Lax' in set_cookie
        
        # Check response structure
        has_ok = data.get('ok') == True
        has_user = 'user' in data and data['user'].get('role') == 'admin'
        has_token = 'token' in data and len(data['token']) > 20
        no_password = 'passwordHash' not in str(data)
        no_mongo_id = '_id' not in str(data)
        
        print(f"Set-Cookie header: {set_cookie[:100]}...")
        print(f"Response keys: {list(data.keys())}")
        print(f"User role: {data.get('user', {}).get('role')}")
        
        if has_cookie and has_ok and has_user and has_token and no_password and no_mongo_id:
            print(f"✅ PASS - Login successful with correct cookie and response structure")
            # Store cookie for later tests
            admin_cookie = response.cookies.get('dlv_token')
            if admin_cookie:
                print(f"✅ Cookie stored for subsequent tests")
        else:
            print(f"❌ FAIL - Response validation failed:")
            print(f"  - Has cookie: {has_cookie}")
            print(f"  - Has ok: {has_ok}")
            print(f"  - Has user with role admin: {has_user}")
            print(f"  - Has token: {has_token}")
            print(f"  - No passwordHash: {no_password}")
            print(f"  - No _id: {no_mongo_id}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A3: POST /api/auth/login with incorrect password
print("\n[A3] POST /api/auth/login - Login with incorrect password")
try:
    response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": "estampadosdlv@gmail.com", "password": "WrongPassword123!"},
        timeout=10
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code == 401:
        data = response.json()
        if 'Credenciales incorrectas' in data.get('error', ''):
            print(f"✅ PASS - Correctly rejected with 401 'Credenciales incorrectas'")
        else:
            print(f"❌ FAIL - Expected 'Credenciales incorrectas', got: {data.get('error')}")
    else:
        print(f"❌ FAIL - Expected 401, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A4: POST /api/auth/login with invalid email format
print("\n[A4] POST /api/auth/login - Login with invalid email format")
try:
    response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": "no-email-here", "password": "SomePassword123!"},
        timeout=10
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        data = response.json()
        if 'Email inválido' in data.get('error', ''):
            print(f"✅ PASS - Correctly rejected with 400 'Email inválido'")
        else:
            print(f"❌ FAIL - Expected 'Email inválido', got: {data.get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A5: POST /api/auth/register with valid data
print("\n[A5] POST /api/auth/register - Register new customer")
timestamp = int(time.time())
test_user_email = f"qatest-{timestamp}@example.cl"
try:
    response = requests.post(
        f"{API_URL}/auth/register",
        json={
            "fullName": "QA Test User",
            "email": test_user_email,
            "password": "qatest12345",
            "phone": "+56911111111"
        },
        timeout=10
    )
    print(f"Status: {response.status_code}")
    print(f"Test user email: {test_user_email}")
    
    if response.status_code == 200:
        data = response.json()
        
        # Check Set-Cookie header
        set_cookie = response.headers.get('Set-Cookie', '')
        has_cookie = 'dlv_token=' in set_cookie
        
        # Check response structure
        has_ok = data.get('ok') == True
        has_user = 'user' in data and data['user'].get('role') == 'customer'
        has_token = 'token' in data
        
        print(f"User role: {data.get('user', {}).get('role')}")
        
        if has_cookie and has_ok and has_user and has_token:
            print(f"✅ PASS - Registration successful with role 'customer' and auto-login cookie")
        else:
            print(f"❌ FAIL - Response validation failed")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A6: POST /api/auth/register with duplicate email
print("\n[A6] POST /api/auth/register - Register with duplicate email")
try:
    response = requests.post(
        f"{API_URL}/auth/register",
        json={
            "fullName": "Duplicate User",
            "email": test_user_email,  # Same as A5
            "password": "duplicate12345",
            "phone": "+56922222222"
        },
        timeout=10
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code == 409:
        data = response.json()
        if 'Ya existe una cuenta con ese email' in data.get('error', ''):
            print(f"✅ PASS - Correctly rejected duplicate email with 409")
        else:
            print(f"❌ FAIL - Expected 'Ya existe una cuenta con ese email', got: {data.get('error')}")
    else:
        print(f"❌ FAIL - Expected 409, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A7: POST /api/auth/register with short password
print("\n[A7] POST /api/auth/register - Register with short password (5 chars)")
try:
    response = requests.post(
        f"{API_URL}/auth/register",
        json={
            "fullName": "Short Pass User",
            "email": f"shortpass-{timestamp}@example.cl",
            "password": "12345",  # Only 5 chars
            "phone": "+56933333333"
        },
        timeout=10
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        data = response.json()
        if 'al menos 6 caracteres' in data.get('error', ''):
            print(f"✅ PASS - Correctly rejected short password with 400")
        else:
            print(f"❌ FAIL - Expected password length error, got: {data.get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A8: GET /api/auth/me with valid cookie
print("\n[A8] GET /api/auth/me - Get current user with valid admin cookie")
try:
    # First login to get fresh cookie
    login_response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": "estampadosdlv@gmail.com", "password": "EstampadosDLV2025!"},
        timeout=10
    )
    
    if login_response.status_code == 200:
        cookies = login_response.cookies
        
        response = requests.get(f"{API_URL}/auth/me", cookies=cookies, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            has_user = 'user' in data and data['user'] is not None
            is_admin = data.get('user', {}).get('role') == 'admin'
            has_id = 'id' in data.get('user', {})
            has_email = data.get('user', {}).get('email') == 'estampadosdlv@gmail.com'
            no_password = 'passwordHash' not in str(data)
            
            print(f"User: {data.get('user', {}).get('email')} (role: {data.get('user', {}).get('role')})")
            
            if has_user and is_admin and has_id and has_email and no_password:
                print(f"✅ PASS - Returned current user without passwordHash")
            else:
                print(f"❌ FAIL - Response validation failed")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
    else:
        print(f"❌ FAIL - Login failed, cannot test /auth/me")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A9: GET /api/auth/me without cookie
print("\n[A9] GET /api/auth/me - Get current user without cookie")
try:
    response = requests.get(f"{API_URL}/auth/me", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        if data.get('user') is None:
            print(f"✅ PASS - Correctly returned {{'user': null}} for unauthenticated request")
        else:
            print(f"❌ FAIL - Expected user: null, got: {data}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A10: PATCH /api/auth/me - Update own profile
print("\n[A10] PATCH /api/auth/me - Update own profile")
try:
    # Login first
    login_response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": "estampadosdlv@gmail.com", "password": "EstampadosDLV2025!"},
        timeout=10
    )
    
    if login_response.status_code == 200:
        cookies = login_response.cookies
        
        response = requests.patch(
            f"{API_URL}/auth/me",
            json={"fullName": "Nuevo Nombre Admin"},
            cookies=cookies,
            timeout=10
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('ok') and data.get('user', {}).get('fullName') == 'Nuevo Nombre Admin':
                print(f"✅ PASS - Profile updated successfully")
                
                # Revert the change
                revert_response = requests.patch(
                    f"{API_URL}/auth/me",
                    json={"fullName": "Administrador Estampados DLV"},
                    cookies=cookies,
                    timeout=10
                )
                if revert_response.status_code == 200:
                    print(f"✅ Profile reverted to original name")
            else:
                print(f"❌ FAIL - Update failed or name not changed")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
    else:
        print(f"❌ FAIL - Login failed, cannot test PATCH /auth/me")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A11: POST /api/auth/change-password - Change password (then revert)
print("\n[A11] POST /api/auth/change-password - Change password and revert")
try:
    # Login first
    login_response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": "estampadosdlv@gmail.com", "password": "EstampadosDLV2025!"},
        timeout=10
    )
    
    if login_response.status_code == 200:
        cookies = login_response.cookies
        
        # Change password
        response = requests.post(
            f"{API_URL}/auth/change-password",
            json={
                "currentPassword": "EstampadosDLV2025!",
                "newPassword": "NewPass2025!"
            },
            cookies=cookies,
            timeout=10
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('ok') == True:
                print(f"✅ PASS - Password changed successfully")
                
                # Revert password immediately
                # Need to login with new password first
                login2 = requests.post(
                    f"{API_URL}/auth/login",
                    json={"email": "estampadosdlv@gmail.com", "password": "NewPass2025!"},
                    timeout=10
                )
                
                if login2.status_code == 200:
                    cookies2 = login2.cookies
                    revert_response = requests.post(
                        f"{API_URL}/auth/change-password",
                        json={
                            "currentPassword": "NewPass2025!",
                            "newPassword": "EstampadosDLV2025!"
                        },
                        cookies=cookies2,
                        timeout=10
                    )
                    
                    if revert_response.status_code == 200:
                        print(f"✅ Password reverted to original: EstampadosDLV2025!")
                    else:
                        print(f"⚠️  WARNING - Failed to revert password! Manual intervention needed.")
                else:
                    print(f"⚠️  WARNING - Cannot login with new password to revert!")
            else:
                print(f"❌ FAIL - Password change failed")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
    else:
        print(f"❌ FAIL - Login failed, cannot test change-password")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A12: POST /api/auth/change-password with incorrect current password
print("\n[A12] POST /api/auth/change-password - With incorrect current password")
try:
    # Login first
    login_response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": "estampadosdlv@gmail.com", "password": "EstampadosDLV2025!"},
        timeout=10
    )
    
    if login_response.status_code == 200:
        cookies = login_response.cookies
        
        response = requests.post(
            f"{API_URL}/auth/change-password",
            json={
                "currentPassword": "WrongCurrentPassword!",
                "newPassword": "NewPass2025!"
            },
            cookies=cookies,
            timeout=10
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code == 401:
            data = response.json()
            if 'contraseña actual es incorrecta' in data.get('error', '').lower():
                print(f"✅ PASS - Correctly rejected with 401")
            else:
                print(f"❌ FAIL - Expected current password error, got: {data.get('error')}")
        else:
            print(f"❌ FAIL - Expected 401, got {response.status_code}")
    else:
        print(f"❌ FAIL - Login failed, cannot test change-password")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# A13: POST /api/auth/logout
print("\n[A13] POST /api/auth/logout - Logout and clear cookie")
try:
    response = requests.post(f"{API_URL}/auth/logout", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        set_cookie = response.headers.get('Set-Cookie', '')
        
        # Check if cookie is cleared (Max-Age=0 or Expires in past)
        cookie_cleared = 'Max-Age=0' in set_cookie or 'Expires=' in set_cookie
        
        if data.get('ok') == True and cookie_cleared:
            print(f"✅ PASS - Logout successful with cookie cleared")
            print(f"Set-Cookie: {set_cookie[:100]}...")
        else:
            print(f"❌ FAIL - Logout response or cookie clearing failed")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# ============================================================================
# SECTION B: CONTACT FORM (PRIORITY HIGH)
# ============================================================================

print("\n\n📍 SECTION B: CONTACT FORM (/api/contact)")
print("=" * 80)

# B1: POST /api/contact with valid data
print("\n[B1] POST /api/contact - Submit valid contact form")
try:
    response = requests.post(
        f"{API_URL}/contact",
        json={
            "name": "Test User",
            "email": "test@example.cl",
            "phone": "+56911111111",
            "subject": "Consulta",
            "message": "Este es un mensaje de prueba con más de 10 caracteres para validación."
        },
        timeout=10
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if data.get('ok') == True:
            # delivered can be true or false depending on SMTP config
            delivered = data.get('delivered')
            print(f"✅ PASS - Contact form submitted successfully (delivered: {delivered})")
        else:
            print(f"❌ FAIL - Expected ok: true")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# B2: POST /api/contact with empty name
print("\n[B2] POST /api/contact - Submit with empty name")
try:
    response = requests.post(
        f"{API_URL}/contact",
        json={
            "name": "",
            "email": "test@example.cl",
            "phone": "+56911111111",
            "subject": "Consulta",
            "message": "Este es un mensaje de prueba."
        },
        timeout=10
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        data = response.json()
        if 'nombre es obligatorio' in data.get('error', '').lower():
            print(f"✅ PASS - Correctly rejected with 400 'El nombre es obligatorio'")
        else:
            print(f"❌ FAIL - Expected name required error, got: {data.get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# B3: POST /api/contact with invalid email
print("\n[B3] POST /api/contact - Submit with invalid email")
try:
    response = requests.post(
        f"{API_URL}/contact",
        json={
            "name": "Test User",
            "email": "bademail",
            "phone": "+56911111111",
            "subject": "Consulta",
            "message": "Este es un mensaje de prueba."
        },
        timeout=10
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        data = response.json()
        if 'email inválido' in data.get('error', '').lower():
            print(f"✅ PASS - Correctly rejected with 400 'Email inválido'")
        else:
            print(f"❌ FAIL - Expected email invalid error, got: {data.get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# B4: POST /api/contact with short message
print("\n[B4] POST /api/contact - Submit with short message (5 chars)")
try:
    response = requests.post(
        f"{API_URL}/contact",
        json={
            "name": "Test User",
            "email": "test@example.cl",
            "phone": "+56911111111",
            "subject": "Consulta",
            "message": "corto"
        },
        timeout=10
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        data = response.json()
        if 'al menos 10 caracteres' in data.get('error', '').lower():
            print(f"✅ PASS - Correctly rejected with 400 'mensaje debe tener al menos 10 caracteres'")
        else:
            print(f"❌ FAIL - Expected message length error, got: {data.get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# B5: POST /api/contact with honeypot
print("\n[B5] POST /api/contact - Submit with honeypot (bot detection)")
try:
    response = requests.post(
        f"{API_URL}/contact",
        json={
            "name": "Bot User",
            "email": "bot@example.cl",
            "phone": "+56911111111",
            "subject": "Spam",
            "message": "This is a spam message from a bot.",
            "website": "i am a bot"  # Honeypot field
        },
        timeout=10
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        if data.get('ok') == True and data.get('silent') == True and data.get('delivered') == False:
            print(f"✅ PASS - Bot detected, silent success (no email sent)")
        else:
            print(f"❌ FAIL - Expected silent: true, delivered: false")
            print(f"Response: {json.dumps(data, indent=2)}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# B6: Verify MongoDB contact_messages count
print("\n[B6] Verify MongoDB - contact_messages collection has entries")
print("⚠️  Note: This requires direct MongoDB access. Skipping automated check.")
print("Manual verification: db.contact_messages.find().count() should be >= 2 (B1 + B5)")

# ============================================================================
# SECTION C: UPLOADS IMAGE (PRIORITY HIGH)
# ============================================================================

print("\n\n📍 SECTION C: UPLOADS IMAGE (/api/uploads/image)")
print("=" * 80)

# C1: POST /api/uploads/image with valid PNG
print("\n[C1] POST /api/uploads/image - Upload valid PNG")
try:
    # Create a small 100x100 white PNG in memory
    img = Image.new('RGB', (100, 100), color='white')
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    files = {'file': ('test.png', buffer, 'image/png')}
    data = {'folder': 'landings'}
    
    response = requests.post(f"{API_URL}/uploads/image", files=files, data=data, timeout=15)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        has_id = 'id' in result
        has_url = 'url' in result and '/uploads/landings/' in result['url']
        has_dimensions = result.get('widthPx') == 100 and result.get('heightPx') == 100
        has_format = result.get('format') == 'png'
        has_size = result.get('sizeBytes', 0) > 0
        
        if has_id and has_url and has_dimensions and has_format and has_size:
            print(f"✅ PASS - Image uploaded successfully")
            uploaded_image_url = result['url']
            print(f"Uploaded URL: {uploaded_image_url}")
        else:
            print(f"❌ FAIL - Response validation failed")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# C2: Verify file exists on filesystem
print("\n[C2] Verify uploaded file exists on filesystem")
if uploaded_image_url:
    try:
        # Extract filename from URL
        filename = uploaded_image_url.split('/')[-1]
        filepath = f"/app/public/uploads/landings/{filename}"
        
        if os.path.exists(filepath):
            print(f"✅ PASS - File exists at {filepath}")
        else:
            print(f"❌ FAIL - File not found at {filepath}")
    except Exception as e:
        print(f"❌ FAIL - Exception: {e}")
else:
    print(f"⚠️  SKIP - No uploaded image URL from C1")

# C3: POST /api/uploads/image without file
print("\n[C3] POST /api/uploads/image - Without file")
try:
    data = {'folder': 'landings'}
    response = requests.post(f"{API_URL}/uploads/image", data=data, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 400:
        result = response.json()
        if 'file requerido' in result.get('error', '').lower():
            print(f"✅ PASS - Correctly rejected with 400 'file requerido'")
        else:
            print(f"❌ FAIL - Expected 'file requerido', got: {result.get('error')}")
    else:
        print(f"❌ FAIL - Expected 400, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# ============================================================================
# SECTION D: LANDINGS heroImage (PRIORITY MEDIUM)
# ============================================================================

print("\n\n📍 SECTION D: LANDINGS heroImage SUPPORT")
print("=" * 80)

# D1: POST /api/landings with heroImage
print("\n[D1] POST /api/landings - Create landing with heroImage")
try:
    timestamp = int(time.time())
    payload = {
        "slug": f"test-hero-{timestamp}",
        "h1": "Test Landing with Hero Image",
        "heroImage": "/uploads/landings/test.jpg",
        "active": True
    }
    
    response = requests.post(f"{API_URL}/landings", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        if data.get('heroImage') == "/uploads/landings/test.jpg":
            print(f"✅ PASS - Landing created with heroImage")
            created_landing_id = data.get('id')
            print(f"Created landing ID: {created_landing_id}")
        else:
            print(f"❌ FAIL - heroImage not in response or incorrect")
            print(f"Response: {json.dumps(data, indent=2)}")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# D2: PATCH /api/landings - Update heroImage
print("\n[D2] PATCH /api/landings - Update heroImage")
if created_landing_id:
    try:
        payload = {
            "id": created_landing_id,
            "heroImage": "/uploads/landings/updated.jpg"
        }
        
        response = requests.patch(f"{API_URL}/landings", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('heroImage') == "/uploads/landings/updated.jpg":
                print(f"✅ PASS - heroImage updated successfully")
            else:
                print(f"❌ FAIL - heroImage not updated")
                print(f"Response: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
    except Exception as e:
        print(f"❌ FAIL - Exception: {e}")
else:
    print(f"⚠️  SKIP - No landing ID from D1")

# D3: GET /api/landings - Verify heroImage in response
print("\n[D3] GET /api/landings - Verify heroImage in response")
if created_landing_id:
    try:
        response = requests.get(f"{API_URL}/landings", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Find our test landing
            test_landing = next((l for l in data if l.get('id') == created_landing_id), None)
            
            if test_landing and test_landing.get('heroImage') == "/uploads/landings/updated.jpg":
                print(f"✅ PASS - heroImage present in GET response")
            else:
                print(f"❌ FAIL - heroImage not found or incorrect in GET response")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL - Exception: {e}")
else:
    print(f"⚠️  SKIP - No landing ID from D1")

# D4: DELETE test landing (cleanup)
print("\n[D4] DELETE /api/landings - Cleanup test landing")
if created_landing_id:
    try:
        response = requests.delete(f"{API_URL}/landings", json={"id": created_landing_id}, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            print(f"✅ PASS - Test landing deleted successfully")
        else:
            print(f"⚠️  WARNING - Failed to delete test landing (ID: {created_landing_id})")
    except Exception as e:
        print(f"⚠️  WARNING - Exception during cleanup: {e}")
else:
    print(f"⚠️  SKIP - No landing ID to cleanup")

# ============================================================================
# SECTION E: ORDERS customerEmail FILTER (PRIORITY MEDIUM)
# ============================================================================

print("\n\n📍 SECTION E: ORDERS customerEmail FILTER")
print("=" * 80)

# E1: GET /api/orders?customerEmail=nonexistent
print("\n[E1] GET /api/orders?customerEmail=nonexistent@nowhere.cl")
try:
    response = requests.get(f"{API_URL}/orders?customerEmail=nonexistent@nowhere.cl", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        if isinstance(data, list) and len(data) == 0:
            print(f"✅ PASS - Returned empty array for nonexistent email")
        else:
            print(f"❌ FAIL - Expected empty array, got {len(data)} items")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# E2: GET /api/orders without filter (regression)
print("\n[E2] GET /api/orders - Without filter (regression)")
try:
    response = requests.get(f"{API_URL}/orders", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        if isinstance(data, list) and len(data) > 0:
            print(f"✅ PASS - Returned {len(data)} orders (regression: still returns all)")
        else:
            print(f"❌ FAIL - Expected non-empty array")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# ============================================================================
# SECTION F: MIDDLEWARE REDIRECTS (PRIORITY MEDIUM)
# ============================================================================

print("\n\n📍 SECTION F: MIDDLEWARE REDIRECTS")
print("=" * 80)

# F1: GET / without cookie → 307 redirect
print("\n[F1] GET / - Without cookie (should redirect to /login)")
try:
    response = requests.get(BASE_URL + "/", allow_redirects=False, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 307:
        location = response.headers.get('Location', '')
        if '/login?next=%2F' in location or '/login' in location:
            print(f"✅ PASS - Redirected to login: {location}")
        else:
            print(f"❌ FAIL - Unexpected redirect location: {location}")
    else:
        print(f"❌ FAIL - Expected 307, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# F2: GET /kanban without cookie → 307 redirect
print("\n[F2] GET /kanban - Without cookie (should redirect to /login)")
try:
    response = requests.get(BASE_URL + "/kanban", allow_redirects=False, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 307:
        location = response.headers.get('Location', '')
        if '/login?next=%2Fkanban' in location or '/login' in location:
            print(f"✅ PASS - Redirected to login: {location}")
        else:
            print(f"❌ FAIL - Unexpected redirect location: {location}")
    else:
        print(f"❌ FAIL - Expected 307, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# F3: GET /mi-cuenta without cookie → 307 redirect
print("\n[F3] GET /mi-cuenta - Without cookie (should redirect to /login)")
try:
    response = requests.get(BASE_URL + "/mi-cuenta", allow_redirects=False, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 307:
        location = response.headers.get('Location', '')
        if '/login?next=%2Fmi-cuenta' in location or '/login' in location:
            print(f"✅ PASS - Redirected to login: {location}")
        else:
            print(f"❌ FAIL - Unexpected redirect location: {location}")
    else:
        print(f"❌ FAIL - Expected 307, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# F4: GET /tienda without cookie → 200 (public)
print("\n[F4] GET /tienda - Without cookie (public, should be 200)")
try:
    response = requests.get(BASE_URL + "/tienda", allow_redirects=False, timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        print(f"✅ PASS - Public route accessible without auth")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# F5: GET /api/products without cookie → 200 (public API)
print("\n[F5] GET /api/products - Without cookie (public API, should be 200)")
try:
    response = requests.get(f"{API_URL}/products", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        print(f"✅ PASS - Public API accessible without auth")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# F6: GET / with valid admin cookie → 200 (no redirect)
print("\n[F6] GET / - With valid admin cookie (should be 200, no redirect)")
try:
    # Login first
    login_response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": "estampadosdlv@gmail.com", "password": "EstampadosDLV2025!"},
        timeout=10
    )
    
    if login_response.status_code == 200:
        cookies = login_response.cookies
        
        response = requests.get(BASE_URL + "/", cookies=cookies, allow_redirects=False, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            print(f"✅ PASS - Authenticated user can access admin route")
        else:
            print(f"❌ FAIL - Expected 200, got {response.status_code}")
    else:
        print(f"❌ FAIL - Login failed, cannot test authenticated access")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# ============================================================================
# SECTION G: REGRESSION SMOKE TESTS
# ============================================================================

print("\n\n📍 SECTION G: REGRESSION SMOKE TESTS")
print("=" * 80)

# G1: GET /api/products
print("\n[G1] GET /api/products - Smoke test")
try:
    response = requests.get(f"{API_URL}/products", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        if isinstance(data, list) and len(data) > 0:
            print(f"✅ PASS - Products endpoint working ({len(data)} products)")
        else:
            print(f"⚠️  WARNING - Products list is empty")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# G2: GET /api/dashboard/summary
print("\n[G2] GET /api/dashboard/summary - Smoke test")
try:
    response = requests.get(f"{API_URL}/dashboard/summary", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        has_keys = all(k in data for k in ['salesToday', 'pendingOrders', 'printerQueues'])
        if has_keys:
            print(f"✅ PASS - Dashboard summary working (salesToday: ${data.get('salesToday', 0)})")
        else:
            print(f"❌ FAIL - Missing expected keys in response")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# G3: GET /api/config
print("\n[G3] GET /api/config - Smoke test")
try:
    response = requests.get(f"{API_URL}/config", timeout=10)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        has_printers_dynamic = 'printersDynamic' in data
        if has_printers_dynamic:
            print(f"✅ PASS - Config endpoint working with printersDynamic")
        else:
            print(f"⚠️  WARNING - printersDynamic not in config")
    else:
        print(f"❌ FAIL - Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL - Exception: {e}")

# ============================================================================
# FINAL SUMMARY
# ============================================================================

print("\n\n" + "=" * 80)
print("🏁 ITERATION 5 BACKEND TESTING COMPLETE")
print("=" * 80)
print("\nTest file: /app/backend_test_iteration5.py")
print(f"Base URL: {BASE_URL}")
print(f"API URL: {API_URL}")
print("\nReview results above for PASS/FAIL status of each test.")
print("\n⚠️  IMPORTANT: Admin password must remain 'EstampadosDLV2025!' after all tests.")
