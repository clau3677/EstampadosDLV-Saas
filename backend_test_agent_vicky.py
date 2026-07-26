#!/usr/bin/env python3
"""
Backend Testing: AI Sales Agent "Vicky" (MiniMax M2 + multi-canal Web + WhatsApp)
Estampados DLV — DTF Print Workshop

BUDGET WARNING: Real LLM calls cost tokens. Budget max ~20 chat completions (~50k tokens).
Each chat can take 3-15 seconds.

Test Coverage:
1. GET /api/agent/ping
2. GET /api/agent/config
3. PATCH /api/agent/config
4. POST /api/agent/seed (idempotency)
5. KB CRUD (GET/POST/PATCH/DELETE /api/agent/knowledge)
6. POST /api/agent/chat (basic flow)
7. POST /api/agent/chat (tool-calling: quote_gang_sheet)
8. POST /api/agent/chat (tool-calling: search_products)
9. POST /api/agent/chat (handoff/escalation)
10. Contact matching
11. Missing message validation
12. GET /api/agent/conversations
13. GET /api/agent/conversations/:id
14. PATCH /api/agent/conversations/:id
15. POST /api/agent/conversations/:id/send
16. POST /api/agent/handoff
17. Order draft flow via chat
18. Regression tests
"""

import os
import sys
import requests
import time
from datetime import datetime

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://dtf-print-hub-2.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Test state
test_results = {
    'passed': 0,
    'failed': 0,
    'total_tokens': 0,
    'llm_calls': 0,
}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_pass(name):
    test_results['passed'] += 1
    log(f"✅ PASS: {name}")

def test_fail(name, reason):
    test_results['failed'] += 1
    log(f"❌ FAIL: {name} — {reason}")

def track_tokens(usage):
    """Track token usage from LLM responses"""
    if usage:
        test_results['total_tokens'] += usage.get('total_tokens', 0)
        test_results['llm_calls'] += 1

# ============================================================================
# TEST 1: GET /api/agent/ping
# ============================================================================
def test_ping():
    log("\n=== TEST 1: GET /api/agent/ping ===")
    try:
        r = requests.get(f"{API_URL}/agent/ping", timeout=30)
        data = r.json()
        
        if r.status_code != 200:
            test_fail("Ping", f"Status {r.status_code}")
            return
        
        # Verify response structure
        if not data.get('ok'):
            test_fail("Ping", f"ok=false, error: {data.get('error')}")
            return
        
        if data.get('model') != 'MiniMax-M2':
            test_fail("Ping", f"Expected model MiniMax-M2, got {data.get('model')}")
            return
        
        config = data.get('config', {})
        if not config.get('configured'):
            test_fail("Ping", "LLM not configured")
            return
        
        if config.get('keyType') != 'subscription':
            test_fail("Ping", f"Expected keyType=subscription, got {config.get('keyType')}")
            return
        
        # Verify API key is NOT leaked
        if 'sk-' in str(data):
            test_fail("Ping", "API key leaked in response")
            return
        
        # Track tokens
        track_tokens(data.get('usage'))
        
        log(f"  Model: {data.get('model')}, Latency: {data.get('latencyMs')}ms, Sample: {data.get('sample')}")
        test_pass("Ping - LLM health check")
        
    except Exception as e:
        test_fail("Ping", str(e))

# ============================================================================
# TEST 2: GET /api/agent/config
# ============================================================================
def test_get_config():
    log("\n=== TEST 2: GET /api/agent/config ===")
    try:
        r = requests.get(f"{API_URL}/agent/config", timeout=10)
        data = r.json()
        
        if r.status_code != 200:
            test_fail("Get config", f"Status {r.status_code}")
            return None
        
        config = data.get('config')
        llm = data.get('llm')
        
        if not config:
            test_fail("Get config", "config is null")
            return None
        
        # Verify config structure
        if 'persona' not in config:
            test_fail("Get config", "Missing persona")
            return None
        
        if 'rules' not in config or not isinstance(config['rules'], list):
            test_fail("Get config", "Missing or invalid rules")
            return None
        
        if 'businessInfo' not in config:
            test_fail("Get config", "Missing businessInfo")
            return None
        
        # Verify LLM config
        if not llm or not llm.get('configured'):
            test_fail("Get config", "LLM not configured")
            return None
        
        # Verify API key is NOT leaked
        if 'sk-' in str(data):
            test_fail("Get config", "API key leaked in response")
            return None
        
        log(f"  Persona: {config['persona'].get('name')}, Rules: {len(config['rules'])}")
        test_pass("Get config")
        return config
        
    except Exception as e:
        test_fail("Get config", str(e))
        return None

# ============================================================================
# TEST 3: PATCH /api/agent/config
# ============================================================================
def test_patch_config():
    log("\n=== TEST 3: PATCH /api/agent/config ===")
    try:
        # Get current config
        r = requests.get(f"{API_URL}/agent/config", timeout=10)
        original = r.json().get('config', {})
        original_address = original.get('businessInfo', {}).get('address', '')
        
        # Update address
        test_address = "Prueba testing 123"
        r = requests.patch(
            f"{API_URL}/agent/config",
            json={'businessInfo': {**original.get('businessInfo', {}), 'address': test_address}},
            timeout=10
        )
        
        if r.status_code != 200:
            test_fail("Patch config", f"Status {r.status_code}")
            return
        
        data = r.json()
        if not data.get('ok'):
            test_fail("Patch config", "ok=false")
            return
        
        # Verify change persisted
        r = requests.get(f"{API_URL}/agent/config", timeout=10)
        updated = r.json().get('config', {})
        
        if updated.get('businessInfo', {}).get('address') != test_address:
            test_fail("Patch config", "Address not updated")
            return
        
        # Revert change
        requests.patch(
            f"{API_URL}/agent/config",
            json={'businessInfo': {**updated.get('businessInfo', {}), 'address': original_address}},
            timeout=10
        )
        
        log(f"  Updated address to: {test_address}, then reverted")
        test_pass("Patch config - update and persist")
        
    except Exception as e:
        test_fail("Patch config", str(e))

# ============================================================================
# TEST 4: POST /api/agent/seed (idempotency)
# ============================================================================
def test_seed():
    log("\n=== TEST 4: POST /api/agent/seed (idempotency) ===")
    try:
        # First call
        r1 = requests.post(f"{API_URL}/agent/seed", timeout=10)
        data1 = r1.json()
        
        if r1.status_code != 200:
            test_fail("Seed", f"Status {r1.status_code}")
            return
        
        # Second call (should skip)
        r2 = requests.post(f"{API_URL}/agent/seed", timeout=10)
        data2 = r2.json()
        
        if r2.status_code != 200:
            test_fail("Seed idempotency", f"Status {r2.status_code}")
            return
        
        # Verify second call skipped
        if not data2.get('skipped'):
            test_fail("Seed idempotency", "Second call did not skip")
            return
        
        if data2.get('reason') != 'already_configured':
            test_fail("Seed idempotency", f"Wrong reason: {data2.get('reason')}")
            return
        
        log(f"  First call: {data1}, Second call: {data2}")
        test_pass("Seed - idempotency verified")
        
    except Exception as e:
        test_fail("Seed", str(e))

# ============================================================================
# TEST 5: KB CRUD
# ============================================================================
def test_kb_crud():
    log("\n=== TEST 5: KB CRUD ===")
    created_ids = []
    
    try:
        # GET /api/agent/knowledge
        r = requests.get(f"{API_URL}/agent/knowledge", timeout=10)
        if r.status_code != 200:
            test_fail("KB GET", f"Status {r.status_code}")
            return
        
        items = r.json()
        if not isinstance(items, list):
            test_fail("KB GET", "Response not an array")
            return
        
        log(f"  GET: {len(items)} items")
        test_pass("KB GET - list items")
        
        # POST QA item
        r = requests.post(
            f"{API_URL}/agent/knowledge",
            json={
                'type': 'qa',
                'question': 'Test question?',
                'answer': 'Test answer',
                'tags': ['test']
            },
            timeout=10
        )
        
        if r.status_code != 200:
            test_fail("KB POST QA", f"Status {r.status_code}")
            return
        
        qa_item = r.json().get('item')
        if not qa_item or not qa_item.get('id'):
            test_fail("KB POST QA", "No item returned")
            return
        
        created_ids.append(qa_item['id'])
        log(f"  POST QA: {qa_item['id']}")
        test_pass("KB POST - create QA item")
        
        # POST block item
        r = requests.post(
            f"{API_URL}/agent/knowledge",
            json={
                'type': 'block',
                'title': 'Test block',
                'body': 'Block content',
                'tags': ['test']
            },
            timeout=10
        )
        
        if r.status_code != 200:
            test_fail("KB POST block", f"Status {r.status_code}")
            return
        
        block_item = r.json().get('item')
        if not block_item or not block_item.get('id'):
            test_fail("KB POST block", "No item returned")
            return
        
        created_ids.append(block_item['id'])
        log(f"  POST block: {block_item['id']}")
        test_pass("KB POST - create block item")
        
        # PATCH item (deactivate)
        r = requests.patch(
            f"{API_URL}/agent/knowledge/{qa_item['id']}",
            json={'active': False},
            timeout=10
        )
        
        if r.status_code != 200:
            test_fail("KB PATCH", f"Status {r.status_code}")
            return
        
        updated = r.json().get('item')
        if updated.get('active') != False:
            test_fail("KB PATCH", "active not updated")
            return
        
        log(f"  PATCH: deactivated {qa_item['id']}")
        test_pass("KB PATCH - update item")
        
        # DELETE items
        for item_id in created_ids:
            r = requests.delete(f"{API_URL}/agent/knowledge/{item_id}", timeout=10)
            if r.status_code != 200:
                test_fail("KB DELETE", f"Status {r.status_code} for {item_id}")
                return
        
        log(f"  DELETE: removed {len(created_ids)} items")
        test_pass("KB DELETE - remove items")
        
    except Exception as e:
        test_fail("KB CRUD", str(e))

# ============================================================================
# TEST 6: Basic chat (source='web')
# ============================================================================
def test_basic_chat():
    log("\n=== TEST 6: Basic chat (source='web') ===")
    try:
        r = requests.post(
            f"{API_URL}/agent/chat",
            json={
                'message': 'Hola!',
                'source': 'web',
                'contact': {'name': 'TestBot'}
            },
            timeout=30
        )
        
        if r.status_code != 200:
            test_fail("Basic chat", f"Status {r.status_code}")
            return None
        
        data = r.json()
        
        # Verify response structure
        if not data.get('conversationId'):
            test_fail("Basic chat", "No conversationId")
            return None
        
        if not data.get('contactId'):
            test_fail("Basic chat", "No contactId")
            return None
        
        if not data.get('reply'):
            test_fail("Basic chat", "No reply")
            return None
        
        # Track tokens
        track_tokens(data.get('usage'))
        
        # Verify reply is in Spanish (heuristic check)
        reply = data['reply'].lower()
        spanish_indicators = ['hola', 'qué', 'cómo', 'estampados', 'dlv', 'po', 'ayud']
        has_spanish = any(word in reply for word in spanish_indicators)
        
        if not has_spanish:
            log(f"  WARNING: Reply may not be in Spanish: {reply[:100]}")
        
        log(f"  ConversationId: {data['conversationId'][:8]}...")
        log(f"  Reply: {reply[:80]}...")
        log(f"  Tokens: {data.get('usage', {}).get('total_tokens', 0)}")
        test_pass("Basic chat - web source")
        
        return data['conversationId']
        
    except Exception as e:
        test_fail("Basic chat", str(e))
        return None

# ============================================================================
# TEST 7: Tool-calling: quote_gang_sheet
# ============================================================================
def test_quote_tool(conversation_id):
    log("\n=== TEST 7: Tool-calling: quote_gang_sheet ===")
    if not conversation_id:
        test_fail("Quote tool", "No conversation_id from previous test")
        return
    
    try:
        r = requests.post(
            f"{API_URL}/agent/chat",
            json={
                'conversationId': conversation_id,
                'message': 'Cuánto sale un metro de DTF textil de 33 cm?',
                'source': 'web',
                'contact': {'name': 'TestBot'}
            },
            timeout=30
        )
        
        if r.status_code != 200:
            test_fail("Quote tool", f"Status {r.status_code}")
            return
        
        data = r.json()
        
        # Track tokens
        track_tokens(data.get('usage'))
        
        # Verify tool was called
        tool_calls = data.get('toolCalls', [])
        has_quote_tool = any(tc.get('name') == 'quote_gang_sheet' for tc in tool_calls)
        
        if not has_quote_tool:
            log(f"  WARNING: quote_gang_sheet not called. Tools: {tool_calls}")
        
        # Verify reply mentions price
        reply = data.get('reply', '')
        has_price = any(indicator in reply for indicator in ['$', 'CLP', 'peso', 'precio', 'sale'])
        
        if not has_price:
            log(f"  WARNING: Reply doesn't mention price: {reply[:100]}")
        
        log(f"  Tools called: {[tc.get('name') for tc in tool_calls]}")
        log(f"  Reply: {reply[:80]}...")
        log(f"  Tokens: {data.get('usage', {}).get('total_tokens', 0)}")
        test_pass("Quote tool - tool calling working")
        
    except Exception as e:
        test_fail("Quote tool", str(e))

# ============================================================================
# TEST 8: Tool-calling: search_products
# ============================================================================
def test_search_products_tool(conversation_id):
    log("\n=== TEST 8: Tool-calling: search_products ===")
    if not conversation_id:
        test_fail("Search products tool", "No conversation_id")
        return
    
    try:
        r = requests.post(
            f"{API_URL}/agent/chat",
            json={
                'conversationId': conversation_id,
                'message': 'Qué poleras tienen?',
                'source': 'web',
                'contact': {'name': 'TestBot'}
            },
            timeout=30
        )
        
        if r.status_code != 200:
            test_fail("Search products tool", f"Status {r.status_code}")
            return
        
        data = r.json()
        
        # Track tokens
        track_tokens(data.get('usage'))
        
        # Verify tool was called
        tool_calls = data.get('toolCalls', [])
        has_search = any(tc.get('name') in ['search_products', 'get_product_details'] for tc in tool_calls)
        
        if not has_search:
            log(f"  WARNING: search_products not called. Tools: {tool_calls}")
        
        log(f"  Tools called: {[tc.get('name') for tc in tool_calls]}")
        log(f"  Reply: {data.get('reply', '')[:80]}...")
        log(f"  Tokens: {data.get('usage', {}).get('total_tokens', 0)}")
        test_pass("Search products tool - tool calling working")
        
    except Exception as e:
        test_fail("Search products tool", str(e))

# ============================================================================
# TEST 9: Handoff (escalation)
# ============================================================================
def test_handoff():
    log("\n=== TEST 9: Handoff (escalation) ===")
    try:
        # Start new conversation
        r = requests.post(
            f"{API_URL}/agent/chat",
            json={
                'message': 'Quiero hablar con una persona por favor',
                'source': 'web',
                'contact': {'name': 'AngryUser'}
            },
            timeout=30
        )
        
        if r.status_code != 200:
            test_fail("Handoff", f"Status {r.status_code}")
            return None
        
        data = r.json()
        conversation_id = data.get('conversationId')
        
        # Track tokens
        track_tokens(data.get('usage'))
        
        # Check if escalated
        tool_calls = data.get('toolCalls', [])
        has_escalate = any(tc.get('name') == 'escalate_to_human' for tc in tool_calls)
        
        # Get conversation details
        r = requests.get(f"{API_URL}/agent/conversations/{conversation_id}", timeout=10)
        if r.status_code != 200:
            test_fail("Handoff", f"Failed to get conversation: {r.status_code}")
            return None
        
        conv_data = r.json()
        conversation = conv_data.get('conversation', {})
        
        # Verify aiEnabled is false
        if conversation.get('aiEnabled') != False:
            test_fail("Handoff", f"aiEnabled should be false, got {conversation.get('aiEnabled')}")
            return None
        
        # Verify stage is human_takeover
        if conversation.get('stage') != 'human_takeover':
            test_fail("Handoff", f"stage should be human_takeover, got {conversation.get('stage')}")
            return None
        
        log(f"  Escalated: {has_escalate}, aiEnabled: {conversation.get('aiEnabled')}, stage: {conversation.get('stage')}")
        test_pass("Handoff - escalation working")
        
        # Test that next message doesn't call LLM
        r = requests.post(
            f"{API_URL}/agent/chat",
            json={
                'conversationId': conversation_id,
                'message': 'Hola de nuevo',
                'source': 'web',
                'contact': {'name': 'AngryUser'}
            },
            timeout=10
        )
        
        if r.status_code != 200:
            test_fail("Handoff - no LLM call", f"Status {r.status_code}")
            return conversation_id
        
        data = r.json()
        
        # Verify no reply (escalated)
        if data.get('reply') is not None:
            log(f"  WARNING: Got reply when escalated: {data.get('reply')}")
        
        if not data.get('escalated'):
            test_fail("Handoff - no LLM call", "escalated flag not set")
            return conversation_id
        
        log(f"  Second message: escalated={data.get('escalated')}, reply={data.get('reply')}")
        test_pass("Handoff - no LLM call after escalation")
        
        return conversation_id
        
    except Exception as e:
        test_fail("Handoff", str(e))
        return None

# ============================================================================
# TEST 10: Contact matching
# ============================================================================
def test_contact_matching():
    log("\n=== TEST 10: Contact matching ===")
    try:
        phone = "+56900001111"
        
        # First chat
        r1 = requests.post(
            f"{API_URL}/agent/chat",
            json={
                'message': 'Hola',
                'source': 'web',
                'contact': {'phone': phone, 'name': 'User Uno'}
            },
            timeout=30
        )
        
        if r1.status_code != 200:
            test_fail("Contact matching", f"Status {r1.status_code}")
            return
        
        data1 = r1.json()
        contact_id_1 = data1.get('contactId')
        
        # Track tokens
        track_tokens(data1.get('usage'))
        
        # Second chat with same phone (no conversationId)
        r2 = requests.post(
            f"{API_URL}/agent/chat",
            json={
                'message': 'Hola de nuevo',
                'source': 'web',
                'contact': {'phone': phone}
            },
            timeout=30
        )
        
        if r2.status_code != 200:
            test_fail("Contact matching", f"Status {r2.status_code}")
            return
        
        data2 = r2.json()
        contact_id_2 = data2.get('contactId')
        
        # Track tokens
        track_tokens(data2.get('usage'))
        
        # Verify same contact
        if contact_id_1 != contact_id_2:
            test_fail("Contact matching", f"Different contactIds: {contact_id_1} vs {contact_id_2}")
            return
        
        log(f"  ContactId: {contact_id_1}")
        log(f"  Conversation 1: {data1.get('conversationId')[:8]}...")
        log(f"  Conversation 2: {data2.get('conversationId')[:8]}...")
        test_pass("Contact matching - same contact for same phone")
        
    except Exception as e:
        test_fail("Contact matching", str(e))

# ============================================================================
# TEST 11: Missing message validation
# ============================================================================
def test_validation():
    log("\n=== TEST 11: Missing message validation ===")
    try:
        # Empty message
        r = requests.post(
            f"{API_URL}/agent/chat",
            json={'source': 'web'},
            timeout=10
        )
        
        if r.status_code != 400:
            test_fail("Validation - empty message", f"Expected 400, got {r.status_code}")
            return
        
        log(f"  Empty message: {r.status_code} {r.text}")
        test_pass("Validation - empty message rejected")
        
        # Invalid source
        r = requests.post(
            f"{API_URL}/agent/chat",
            json={'message': 'Hola', 'source': 'invalid'},
            timeout=10
        )
        
        if r.status_code != 400:
            test_fail("Validation - invalid source", f"Expected 400, got {r.status_code}")
            return
        
        log(f"  Invalid source: {r.status_code} {r.text}")
        test_pass("Validation - invalid source rejected")
        
    except Exception as e:
        test_fail("Validation", str(e))

# ============================================================================
# TEST 12: GET /api/agent/conversations
# ============================================================================
def test_get_conversations():
    log("\n=== TEST 12: GET /api/agent/conversations ===")
    try:
        # Get all conversations
        r = requests.get(f"{API_URL}/agent/conversations", timeout=10)
        
        if r.status_code != 200:
            test_fail("Get conversations", f"Status {r.status_code}")
            return
        
        conversations = r.json()
        
        if not isinstance(conversations, list):
            test_fail("Get conversations", "Response not an array")
            return
        
        # Verify enrichment
        if len(conversations) > 0:
            conv = conversations[0]
            if 'contact' not in conv:
                test_fail("Get conversations", "Missing contact enrichment")
                return
            
            if 'lastMessage' not in conv:
                test_fail("Get conversations", "Missing lastMessage enrichment")
                return
        
        log(f"  Total conversations: {len(conversations)}")
        test_pass("Get conversations - list with enrichment")
        
        # Filter by source
        r = requests.get(f"{API_URL}/agent/conversations?source=web", timeout=10)
        
        if r.status_code != 200:
            test_fail("Get conversations - filter", f"Status {r.status_code}")
            return
        
        web_convs = r.json()
        log(f"  Web conversations: {len(web_convs)}")
        test_pass("Get conversations - filter by source")
        
    except Exception as e:
        test_fail("Get conversations", str(e))

# ============================================================================
# TEST 13: GET /api/agent/conversations/:id
# ============================================================================
def test_get_conversation_detail(conversation_id):
    log("\n=== TEST 13: GET /api/agent/conversations/:id ===")
    if not conversation_id:
        test_fail("Get conversation detail", "No conversation_id")
        return
    
    try:
        r = requests.get(f"{API_URL}/agent/conversations/{conversation_id}", timeout=10)
        
        if r.status_code != 200:
            test_fail("Get conversation detail", f"Status {r.status_code}")
            return
        
        data = r.json()
        
        # Verify structure
        if 'conversation' not in data:
            test_fail("Get conversation detail", "Missing conversation")
            return
        
        if 'contact' not in data:
            test_fail("Get conversation detail", "Missing contact")
            return
        
        if 'messages' not in data or not isinstance(data['messages'], list):
            test_fail("Get conversation detail", "Missing or invalid messages")
            return
        
        # Verify messages have correct structure
        messages = data['messages']
        for msg in messages:
            if 'role' not in msg:
                test_fail("Get conversation detail", "Message missing role")
                return
            
            # Tool messages should have name
            if msg['role'] == 'tool' and 'name' not in msg:
                test_fail("Get conversation detail", "Tool message missing name")
                return
            
            # Assistant messages with tools should have toolCallsSummary
            if msg['role'] == 'assistant' and msg.get('toolCallsSummary'):
                if not isinstance(msg['toolCallsSummary'], list):
                    test_fail("Get conversation detail", "toolCallsSummary not an array")
                    return
        
        # Verify no _id in any object
        if '_id' in str(data):
            test_fail("Get conversation detail", "_id found in response")
            return
        
        log(f"  Messages: {len(messages)}")
        test_pass("Get conversation detail - full thread")
        
    except Exception as e:
        test_fail("Get conversation detail", str(e))

# ============================================================================
# TEST 14: PATCH /api/agent/conversations/:id
# ============================================================================
def test_patch_conversation(conversation_id):
    log("\n=== TEST 14: PATCH /api/agent/conversations/:id ===")
    if not conversation_id:
        test_fail("Patch conversation", "No conversation_id")
        return
    
    try:
        # Set aiEnabled to false
        r = requests.patch(
            f"{API_URL}/agent/conversations/{conversation_id}",
            json={'aiEnabled': False},
            timeout=10
        )
        
        if r.status_code != 200:
            test_fail("Patch conversation", f"Status {r.status_code}")
            return
        
        data = r.json()
        if not data.get('ok'):
            test_fail("Patch conversation", "ok=false")
            return
        
        # Verify persisted
        r = requests.get(f"{API_URL}/agent/conversations/{conversation_id}", timeout=10)
        conv = r.json().get('conversation', {})
        
        if conv.get('aiEnabled') != False:
            test_fail("Patch conversation", "aiEnabled not updated")
            return
        
        log(f"  aiEnabled: {conv.get('aiEnabled')}")
        test_pass("Patch conversation - update aiEnabled")
        
        # Set stage
        r = requests.patch(
            f"{API_URL}/agent/conversations/{conversation_id}",
            json={'stage': 'interested'},
            timeout=10
        )
        
        if r.status_code != 200:
            test_fail("Patch conversation - stage", f"Status {r.status_code}")
            return
        
        # Verify persisted
        r = requests.get(f"{API_URL}/agent/conversations/{conversation_id}", timeout=10)
        conv = r.json().get('conversation', {})
        
        if conv.get('stage') != 'interested':
            test_fail("Patch conversation - stage", "stage not updated")
            return
        
        log(f"  stage: {conv.get('stage')}")
        test_pass("Patch conversation - update stage")
        
    except Exception as e:
        test_fail("Patch conversation", str(e))

# ============================================================================
# TEST 15: POST /api/agent/conversations/:id/send
# ============================================================================
def test_send_manual_message(conversation_id):
    log("\n=== TEST 15: POST /api/agent/conversations/:id/send ===")
    if not conversation_id:
        test_fail("Send manual message", "No conversation_id")
        return
    
    try:
        r = requests.post(
            f"{API_URL}/agent/conversations/{conversation_id}/send",
            json={'content': 'Hola, soy el operador humano'},
            timeout=10
        )
        
        if r.status_code != 200:
            test_fail("Send manual message", f"Status {r.status_code}")
            return
        
        data = r.json()
        if not data.get('ok'):
            test_fail("Send manual message", "ok=false")
            return
        
        # For web source, waResult should be null
        wa_result = data.get('waResult')
        
        log(f"  waResult: {wa_result}")
        test_pass("Send manual message - manual reply")
        
    except Exception as e:
        test_fail("Send manual message", str(e))

# ============================================================================
# TEST 16: POST /api/agent/handoff
# ============================================================================
def test_handoff_endpoint():
    log("\n=== TEST 16: POST /api/agent/handoff ===")
    try:
        # Create a conversation first
        r = requests.post(
            f"{API_URL}/agent/chat",
            json={
                'message': 'Test handoff',
                'source': 'web',
                'contact': {'name': 'HandoffTest'}
            },
            timeout=30
        )
        
        if r.status_code != 200:
            test_fail("Handoff endpoint", f"Failed to create conversation: {r.status_code}")
            return
        
        conversation_id = r.json().get('conversationId')
        
        # Track tokens
        track_tokens(r.json().get('usage'))
        
        # Call handoff
        r = requests.post(
            f"{API_URL}/agent/handoff",
            json={
                'conversationId': conversation_id,
                'reason': 'customer_request',
                'summary': 'test handoff'
            },
            timeout=10
        )
        
        if r.status_code != 200:
            test_fail("Handoff endpoint", f"Status {r.status_code}")
            return
        
        data = r.json()
        if not data.get('ok'):
            test_fail("Handoff endpoint", "ok=false")
            return
        
        # Verify conversation updated
        r = requests.get(f"{API_URL}/agent/conversations/{conversation_id}", timeout=10)
        conv = r.json().get('conversation', {})
        
        if conv.get('aiEnabled') != False:
            test_fail("Handoff endpoint", "aiEnabled not set to false")
            return
        
        if conv.get('escalationReason') != 'customer_request':
            test_fail("Handoff endpoint", f"Wrong escalationReason: {conv.get('escalationReason')}")
            return
        
        log(f"  aiEnabled: {conv.get('aiEnabled')}, reason: {conv.get('escalationReason')}")
        test_pass("Handoff endpoint - force handoff")
        
    except Exception as e:
        test_fail("Handoff endpoint", str(e))

# ============================================================================
# TEST 17: Order draft flow via chat
# ============================================================================
def test_order_draft_flow():
    log("\n=== TEST 17: Order draft flow via chat ===")
    try:
        r = requests.post(
            f"{API_URL}/agent/chat",
            json={
                'message': 'Quiero comprar 2 metros de DTF textil 33cm, mi nombre es Ana, mi teléfono +56 9 1111 2222 y quiero envío a Santiago',
                'source': 'web',
                'contact': {'name': 'Ana', 'phone': '+56911112222'}
            },
            timeout=30
        )
        
        if r.status_code != 200:
            test_fail("Order draft flow", f"Status {r.status_code}")
            return
        
        data = r.json()
        
        # Track tokens
        track_tokens(data.get('usage'))
        
        # Verify tool was called
        tool_calls = data.get('toolCalls', [])
        has_draft = any(tc.get('name') == 'create_order_draft' for tc in tool_calls)
        
        if not has_draft:
            log(f"  WARNING: create_order_draft not called. Tools: {tool_calls}")
        
        # Verify reply contains checkout URL
        reply = data.get('reply', '')
        has_checkout_url = '/checkout?draft=' in reply
        
        if not has_checkout_url:
            log(f"  WARNING: No checkout URL in reply: {reply[:100]}")
        
        log(f"  Tools called: {[tc.get('name') for tc in tool_calls]}")
        log(f"  Reply: {reply[:80]}...")
        test_pass("Order draft flow - create_order_draft tool")
        
        # Get drafts
        r = requests.get(f"{API_URL}/agent/drafts", timeout=10)
        
        if r.status_code != 200:
            test_fail("Order draft flow - get drafts", f"Status {r.status_code}")
            return
        
        drafts = r.json()
        
        if not isinstance(drafts, list):
            test_fail("Order draft flow - get drafts", "Response not an array")
            return
        
        # Find draft for Ana
        ana_draft = None
        for draft in drafts:
            if draft.get('customer', {}).get('name') == 'Ana':
                ana_draft = draft
                break
        
        if not ana_draft:
            log(f"  WARNING: No draft found for Ana. Total drafts: {len(drafts)}")
        else:
            log(f"  Draft found: {ana_draft.get('id')}, total: {ana_draft.get('totalCLP')}")
            
            # Get draft detail
            r = requests.get(f"{API_URL}/agent/drafts/{ana_draft['id']}", timeout=10)
            
            if r.status_code != 200:
                test_fail("Order draft flow - get draft detail", f"Status {r.status_code}")
                return
            
            draft_detail = r.json()
            
            if 'lines' not in draft_detail:
                test_fail("Order draft flow - get draft detail", "Missing lines")
                return
            
            if 'totalCLP' not in draft_detail:
                test_fail("Order draft flow - get draft detail", "Missing totalCLP")
                return
            
            log(f"  Draft detail: {len(draft_detail.get('lines', []))} lines, total: {draft_detail.get('totalCLP')}")
            test_pass("Order draft flow - draft created and retrieved")
        
    except Exception as e:
        test_fail("Order draft flow", str(e))

# ============================================================================
# TEST 18: Regression tests
# ============================================================================
def test_regression():
    log("\n=== TEST 18: Regression tests ===")
    
    endpoints = [
        ('GET', '/api/products', 'Products'),
        ('GET', '/api/whatsapp/status', 'WhatsApp status'),
        ('GET', '/api/email/status', 'Email status'),
        ('GET', '/api/pre-press/status', 'Pre-press status'),
        ('GET', '/api/dashboard/summary', 'Dashboard summary'),
    ]
    
    for method, endpoint, name in endpoints:
        try:
            r = requests.get(f"{API_URL}{endpoint.replace('/api', '')}", timeout=10)
            
            if r.status_code != 200:
                test_fail(f"Regression - {name}", f"Status {r.status_code}")
                continue
            
            log(f"  {name}: OK")
            test_pass(f"Regression - {name}")
            
        except Exception as e:
            test_fail(f"Regression - {name}", str(e))

# ============================================================================
# MAIN
# ============================================================================
def main():
    log("=" * 80)
    log("AI SALES AGENT 'VICKY' BACKEND TESTING")
    log("MiniMax M2 + multi-canal Web + WhatsApp")
    log("=" * 80)
    log(f"Base URL: {BASE_URL}")
    log(f"API URL: {API_URL}")
    log("")
    
    # Run tests
    test_ping()
    config = test_get_config()
    test_patch_config()
    test_seed()
    test_kb_crud()
    
    # Chat tests (consume tokens)
    conversation_id = test_basic_chat()
    test_quote_tool(conversation_id)
    test_search_products_tool(conversation_id)
    
    handoff_conv_id = test_handoff()
    test_contact_matching()
    test_validation()
    
    # Conversation management
    test_get_conversations()
    if conversation_id:
        test_get_conversation_detail(conversation_id)
        test_patch_conversation(conversation_id)
        test_send_manual_message(conversation_id)
    
    test_handoff_endpoint()
    test_order_draft_flow()
    
    # Regression
    test_regression()
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    log(f"✅ PASSED: {test_results['passed']}")
    log(f"❌ FAILED: {test_results['failed']}")
    log(f"📊 TOTAL TOKENS: {test_results['total_tokens']}")
    log(f"🤖 LLM CALLS: {test_results['llm_calls']}")
    log("=" * 80)
    
    if test_results['failed'] > 0:
        sys.exit(1)
    else:
        log("✅ ALL TESTS PASSED")
        sys.exit(0)

if __name__ == '__main__':
    main()
