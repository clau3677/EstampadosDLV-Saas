#!/usr/bin/env python3
"""
Backend Testing: Reports & Maintenance Modules
Tests the new analytics and maintenance tracking features for Estampados DLV
"""
import requests
import json
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://dtf-print-hub-2.preview.emergentagent.com/api"

def log(msg):
    print(f"[TEST] {msg}")

def test_group(name):
    print(f"\n{'='*80}")
    print(f"  {name}")
    print(f"{'='*80}")

# ============================================================================
# REPORTES MODULE TESTS
# ============================================================================

def test_reports_overview():
    """Test 1.1-1.8: GET /api/reports/overview with various query params"""
    test_group("REPORTES: Overview Endpoint")
    
    # 1.1) Default query (no params)
    log("1.1) GET /api/reports/overview (default)")
    r = requests.get(f"{BASE_URL}/reports/overview")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    
    # Verify all required fields exist
    required_fields = ['revenue', 'paidRevenue', 'orderCount', 'avgTicket', 'byChannel', 
                       'byStatus', 'productionActive', 'printers', 'comparison', 'period']
    for field in required_fields:
        assert field in data, f"Missing field: {field}"
    
    # Verify numeric fields are numbers, not strings
    assert isinstance(data['revenue'], (int, float)), "revenue must be a number"
    assert isinstance(data['paidRevenue'], (int, float)), "paidRevenue must be a number"
    assert isinstance(data['orderCount'], int), "orderCount must be an integer"
    assert isinstance(data['avgTicket'], (int, float)), "avgTicket must be a number"
    
    # Verify avgTicket calculation
    if data['orderCount'] > 0:
        expected_avg = round(data['revenue'] / data['orderCount'])
        assert data['avgTicket'] == expected_avg, f"avgTicket mismatch: {data['avgTicket']} != {expected_avg}"
    else:
        assert data['avgTicket'] == 0, "avgTicket should be 0 when orderCount is 0"
    
    # Verify paidRevenue <= revenue
    assert data['paidRevenue'] <= data['revenue'], f"paidRevenue ({data['paidRevenue']}) > revenue ({data['revenue']})"
    
    # Verify byChannel is a map with valid numbers
    assert isinstance(data['byChannel'], dict), "byChannel must be a dict"
    for channel, count in data['byChannel'].items():
        assert isinstance(count, int), f"byChannel[{channel}] must be an integer"
    
    # Verify period.days is ~30 by default
    assert 'days' in data['period'], "period.days missing"
    assert 25 <= data['period']['days'] <= 35, f"Default period.days should be ~30, got {data['period']['days']}"
    
    log(f"✅ Default overview: revenue=${data['revenue']}, orders={data['orderCount']}, avgTicket=${data['avgTicket']}, period={data['period']['days']}d")
    
    # 1.2) With ?days=7
    log("1.2) GET /api/reports/overview?days=7")
    r = requests.get(f"{BASE_URL}/reports/overview?days=7")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    assert 6 <= data['period']['days'] <= 8, f"Expected ~7 days, got {data['period']['days']}"
    log(f"✅ 7-day overview: period={data['period']['days']}d")
    
    # 1.3) With custom date range
    log("1.3) GET /api/reports/overview?from=2026-07-01&to=2026-07-15")
    r = requests.get(f"{BASE_URL}/reports/overview?from=2026-07-01&to=2026-07-15")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    assert 13 <= data['period']['days'] <= 15, f"Expected ~14 days, got {data['period']['days']}"
    log(f"✅ Custom range overview: period={data['period']['days']}d")
    
    log("✅ ALL OVERVIEW TESTS PASSED")

def test_reports_sales_timeseries():
    """Test 1.2: GET /api/reports/sales-timeseries"""
    test_group("REPORTES: Sales Timeseries")
    
    log("GET /api/reports/sales-timeseries?days=7")
    r = requests.get(f"{BASE_URL}/reports/sales-timeseries?days=7")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    
    assert 'series' in data, "Missing 'series' field"
    assert isinstance(data['series'], list), "series must be a list"
    
    # Verify series length is ~8 (7 days + today)
    assert 7 <= len(data['series']) <= 9, f"Expected ~8 entries for 7 days, got {len(data['series'])}"
    
    # Verify each entry has date, revenue, orders
    for entry in data['series']:
        assert 'date' in entry, "Missing 'date' field"
        assert 'revenue' in entry, "Missing 'revenue' field"
        assert 'orders' in entry, "Missing 'orders' field"
        # Verify date is ISO YYYY-MM-DD format
        assert len(entry['date']) == 10, f"Date should be YYYY-MM-DD format: {entry['date']}"
    
    # Verify no gaps in dates (all days present)
    dates = [entry['date'] for entry in data['series']]
    assert len(dates) == len(set(dates)), "Duplicate dates found"
    
    log(f"✅ Timeseries: {len(data['series'])} days, dates={dates[0]} to {dates[-1]}")
    log("✅ SALES TIMESERIES TESTS PASSED")

def test_reports_top_products():
    """Test 1.3: GET /api/reports/top-products"""
    test_group("REPORTES: Top Products")
    
    # Default limit=10
    log("1) GET /api/reports/top-products?limit=5")
    r = requests.get(f"{BASE_URL}/reports/top-products?limit=5")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    
    assert 'products' in data, "Missing 'products' field"
    assert isinstance(data['products'], list), "products must be a list"
    assert len(data['products']) <= 5, f"Expected at most 5 products, got {len(data['products'])}"
    
    # Verify each product has name, quantity, revenue
    for p in data['products']:
        assert 'name' in p, "Missing 'name' field"
        assert 'quantity' in p, "Missing 'quantity' field"
        assert 'revenue' in p, "Missing 'revenue' field"
    
    # Verify sorted DESC by revenue
    revenues = [p['revenue'] for p in data['products']]
    assert revenues == sorted(revenues, reverse=True), "Products not sorted by revenue DESC"
    
    log(f"✅ Top 5 products: {len(data['products'])} entries, sorted by revenue")
    
    # Test with limit=3
    log("2) GET /api/reports/top-products?limit=3")
    r = requests.get(f"{BASE_URL}/reports/top-products?limit=3")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    assert len(data['products']) <= 3, f"Expected at most 3 products, got {len(data['products'])}"
    log(f"✅ Top 3 products: {len(data['products'])} entries")
    
    log("✅ TOP PRODUCTS TESTS PASSED")

def test_reports_production():
    """Test 1.4: GET /api/reports/production"""
    test_group("REPORTES: Production Report")
    
    log("GET /api/reports/production")
    r = requests.get(f"{BASE_URL}/reports/production")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    
    # Verify three arrays exist
    assert 'throughput' in data, "Missing 'throughput' field"
    assert 'kanbanState' in data, "Missing 'kanbanState' field"
    assert 'prePress' in data, "Missing 'prePress' field"
    
    assert isinstance(data['throughput'], list), "throughput must be a list"
    assert isinstance(data['kanbanState'], list), "kanbanState must be a list"
    assert isinstance(data['prePress'], list), "prePress must be a list"
    
    # Verify throughput entries have printer, completed
    for entry in data['throughput']:
        assert 'printer' in entry, "Missing 'printer' field"
        assert 'completed' in entry, "Missing 'completed' field"
    
    # Verify kanbanState entries have status, count
    for entry in data['kanbanState']:
        assert 'status' in entry, "Missing 'status' field"
        assert 'count' in entry, "Missing 'count' field"
    
    log(f"✅ Production: throughput={len(data['throughput'])}, kanbanState={len(data['kanbanState'])}, prePress={len(data['prePress'])}")
    log("✅ PRODUCTION REPORT TESTS PASSED")

def test_reports_inventory_alerts():
    """Test 1.5: GET /api/reports/inventory-alerts"""
    test_group("REPORTES: Inventory Alerts")
    
    log("GET /api/reports/inventory-alerts")
    r = requests.get(f"{BASE_URL}/reports/inventory-alerts")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    
    # Verify required fields
    assert 'suppliesLow' in data, "Missing 'suppliesLow' field"
    assert 'commercialLow' in data, "Missing 'commercialLow' field"
    assert 'totalSuppliesLow' in data, "Missing 'totalSuppliesLow' field"
    assert 'totalCommercialLow' in data, "Missing 'totalCommercialLow' field"
    
    # Verify suppliesLow entries have correct fields
    for supply in data['suppliesLow']:
        assert 'id' in supply, "Missing 'id' field"
        assert 'name' in supply, "Missing 'name' field"
        assert 'currentStock' in supply, "Missing 'currentStock' field"
        assert 'minimumStock' in supply, "Missing 'minimumStock' field"
        assert 'unit' in supply, "Missing 'unit' field"
        assert 'category' in supply, "Missing 'category' field"
        
        # Verify only supplies where currentStock <= minimumStock AND minimumStock > 0
        assert supply['currentStock'] <= supply['minimumStock'], \
            f"Supply {supply['name']}: currentStock ({supply['currentStock']}) > minimumStock ({supply['minimumStock']})"
        assert supply['minimumStock'] > 0, \
            f"Supply {supply['name']}: minimumStock should be > 0"
    
    log(f"✅ Inventory alerts: suppliesLow={data['totalSuppliesLow']}, commercialLow={data['totalCommercialLow']}")
    log("✅ INVENTORY ALERTS TESTS PASSED")

def test_reports_agent():
    """Test 1.6: GET /api/reports/agent"""
    test_group("REPORTES: Agent Stats")
    
    log("GET /api/reports/agent?days=30")
    r = requests.get(f"{BASE_URL}/reports/agent?days=30")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    
    # Verify required fields
    required_fields = ['conversations', 'escalated', 'escalationRate', 'bySource', 
                       'drafts', 'messagesByRole', 'totalTokens']
    for field in required_fields:
        assert field in data, f"Missing field: {field}"
    
    # Verify escalationRate calculation
    if data['conversations'] > 0:
        expected_rate = round((data['escalated'] / data['conversations']) * 100, 1)
        assert data['escalationRate'] == expected_rate, \
            f"escalationRate mismatch: {data['escalationRate']} != {expected_rate}"
    else:
        assert data['escalationRate'] == 0, "escalationRate should be 0 when conversations=0"
    
    # Verify bySource is a map
    assert isinstance(data['bySource'], dict), "bySource must be a dict"
    
    # Verify messagesByRole has expected roles
    assert isinstance(data['messagesByRole'], dict), "messagesByRole must be a dict"
    
    log(f"✅ Agent stats: conversations={data['conversations']}, escalated={data['escalated']}, rate={data['escalationRate']}%")
    log("✅ AGENT STATS TESTS PASSED")

def test_reports_channels():
    """Test 1.7: GET /api/reports/channels"""
    test_group("REPORTES: Channels Breakdown")
    
    log("GET /api/reports/channels?days=30")
    r = requests.get(f"{BASE_URL}/reports/channels?days=30")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    
    # Verify three arrays exist
    assert 'channel' in data, "Missing 'channel' field"
    assert 'payment' in data, "Missing 'payment' field"
    assert 'delivery' in data, "Missing 'delivery' field"
    
    # Verify each is an array of {name, count, revenue}
    for key in ['channel', 'payment', 'delivery']:
        assert isinstance(data[key], list), f"{key} must be a list"
        for entry in data[key]:
            assert 'name' in entry, f"Missing 'name' in {key}"
            assert 'count' in entry, f"Missing 'count' in {key}"
            assert 'revenue' in entry, f"Missing 'revenue' in {key}"
        
        # Verify sorted DESC by revenue
        revenues = [e['revenue'] for e in data[key]]
        assert revenues == sorted(revenues, reverse=True), f"{key} not sorted by revenue DESC"
    
    log(f"✅ Channels: channel={len(data['channel'])}, payment={len(data['payment'])}, delivery={len(data['delivery'])}")
    log("✅ CHANNELS BREAKDOWN TESTS PASSED")

def test_reports_method_not_allowed():
    """Test 1.8: POST should return 405"""
    test_group("REPORTES: Method Not Allowed")
    
    log("POST /api/reports/overview (should fail)")
    r = requests.post(f"{BASE_URL}/reports/overview", json={})
    assert r.status_code in [405, 404], f"Expected 405 or 404, got {r.status_code}"
    log(f"✅ POST rejected with {r.status_code}")
    log("✅ METHOD NOT ALLOWED TEST PASSED")

# ============================================================================
# MAINTENANCE MODULE TESTS
# ============================================================================

# Global variables to store created log IDs for cleanup
created_log_ids = []

def test_maintenance_types():
    """Test 2.1: GET /api/maintenance/types"""
    test_group("MAINTENANCE: Types Catalog")
    
    log("GET /api/maintenance/types")
    r = requests.get(f"{BASE_URL}/maintenance/types")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    
    assert 'types' in data, "Missing 'types' field"
    assert isinstance(data['types'], list), "types must be a list"
    assert len(data['types']) == 11, f"Expected 11 types, got {len(data['types'])}"
    
    # Verify expected codes exist
    expected_codes = ['nozzle_check', 'head_cleaning', 'deep_cleaning', 'ink_change', 
                      'head_replacement', 'damper_replacement', 'capping_station', 
                      'firmware_update', 'general_service', 'repair', 'other']
    actual_codes = [t['code'] for t in data['types']]
    for code in expected_codes:
        assert code in actual_codes, f"Missing type code: {code}"
    
    # Verify each type has code and label
    for t in data['types']:
        assert 'code' in t, "Missing 'code' field"
        assert 'label' in t, "Missing 'label' field"
    
    log(f"✅ Types catalog: {len(data['types'])} types")
    log("✅ TYPES CATALOG TEST PASSED")

def test_maintenance_create():
    """Test 2.2-2.4: POST /api/maintenance - create log"""
    test_group("MAINTENANCE: Create Log")
    
    # First, get a printer code
    log("Getting printer code from /api/printers")
    r = requests.get(f"{BASE_URL}/printers")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    printers = r.json()
    assert len(printers) > 0, "No printers found"
    printer_code = printers[0]['code']
    log(f"Using printer: {printer_code}")
    
    # 2.2) Create log with all fields
    log("2.2) POST /api/maintenance (full payload)")
    payload = {
        "printerCode": printer_code,
        "type": "head_cleaning",
        "cost": 5000,
        "operatorName": "Backend Test",
        "hoursOperated": 10.5,
        "intervalDays": 15,
        "notes": "test log from backend agent"
    }
    r = requests.post(f"{BASE_URL}/maintenance", json=payload)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    
    assert 'ok' in data and data['ok'] == True, "Expected ok=true"
    assert 'log' in data, "Missing 'log' field"
    
    log_data = data['log']
    # Verify required fields
    assert 'id' in log_data, "Missing 'id' field"
    assert 'printerId' in log_data, "Missing 'printerId' field"
    assert 'printerCode' in log_data, "Missing 'printerCode' field"
    assert 'printerName' in log_data, "Missing 'printerName' field"
    assert 'typeLabel' in log_data, "Missing 'typeLabel' field"
    assert log_data['typeLabel'] == "Limpieza de cabezal", f"Expected 'Limpieza de cabezal', got {log_data['typeLabel']}"
    assert 'date' in log_data, "Missing 'date' field"
    assert log_data['cost'] == 5000, f"Expected cost=5000, got {log_data['cost']}"
    assert 'nextDueDate' in log_data, "Missing 'nextDueDate' field"
    
    # Verify nextDueDate is ~15 days after date
    date = datetime.fromisoformat(log_data['date'].replace('Z', '+00:00'))
    next_due = datetime.fromisoformat(log_data['nextDueDate'].replace('Z', '+00:00'))
    days_diff = (next_due - date).days
    assert 14 <= days_diff <= 16, f"Expected nextDueDate ~15 days after date, got {days_diff} days"
    
    # Store log ID for later tests
    log_id = log_data['id']
    created_log_ids.append(log_id)
    
    log(f"✅ Created log: id={log_id}, cost=5000, nextDueDate in {days_diff} days")
    
    # 2.3) Create log with auto nextDueDate from DEFAULT_INTERVAL_DAYS
    log("2.3) POST /api/maintenance (auto interval for nozzle_check)")
    payload = {
        "printerCode": printer_code,
        "type": "nozzle_check",
        "cost": 0,
        "notes": "auto interval test"
    }
    r = requests.post(f"{BASE_URL}/maintenance", json=payload)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    log_data = data['log']
    
    # Verify nextDueDate is ~7 days after date (DEFAULT for nozzle_check)
    date = datetime.fromisoformat(log_data['date'].replace('Z', '+00:00'))
    next_due = datetime.fromisoformat(log_data['nextDueDate'].replace('Z', '+00:00'))
    days_diff = (next_due - date).days
    assert 6 <= days_diff <= 8, f"Expected nextDueDate ~7 days after date, got {days_diff} days"
    
    created_log_ids.append(log_data['id'])
    log(f"✅ Created log with auto interval: nextDueDate in {days_diff} days")
    
    # 2.4) Validation errors
    log("2.4) POST /api/maintenance - validation errors")
    
    # Missing printerCode
    r = requests.post(f"{BASE_URL}/maintenance", json={"type": "head_cleaning"})
    assert r.status_code == 400, f"Expected 400 for missing printerCode, got {r.status_code}"
    assert "printerCode requerido" in r.text, "Expected 'printerCode requerido' error"
    log("✅ Missing printerCode rejected")
    
    # Missing type
    r = requests.post(f"{BASE_URL}/maintenance", json={"printerCode": printer_code})
    assert r.status_code == 400, f"Expected 400 for missing type, got {r.status_code}"
    assert "type requerido" in r.text, "Expected 'type requerido' error"
    log("✅ Missing type rejected")
    
    # Non-existent printerCode
    r = requests.post(f"{BASE_URL}/maintenance", json={"printerCode": "does_not_exist", "type": "head_cleaning"})
    assert r.status_code == 404, f"Expected 404 for non-existent printer, got {r.status_code}"
    log("✅ Non-existent printerCode rejected")
    
    log("✅ CREATE LOG TESTS PASSED")
    return log_id  # Return the first log ID for later tests

def test_maintenance_list(log_id):
    """Test 2.5: GET /api/maintenance"""
    test_group("MAINTENANCE: List Logs")
    
    # Get printer code from the log we created
    r = requests.get(f"{BASE_URL}/maintenance/{log_id}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    log_data = r.json()
    printer_code = log_data['printerCode']
    
    # List all logs
    log("1) GET /api/maintenance")
    r = requests.get(f"{BASE_URL}/maintenance")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    logs = r.json()
    assert isinstance(logs, list), "Expected array of logs"
    
    # Verify our created log is in the results
    found = any(l['id'] == log_id for l in logs)
    assert found, f"Created log {log_id} not found in list"
    
    # Verify sorted DESC by date
    dates = [datetime.fromisoformat(l['date'].replace('Z', '+00:00')) for l in logs]
    assert dates == sorted(dates, reverse=True), "Logs not sorted DESC by date"
    
    log(f"✅ List all: {len(logs)} logs, sorted DESC by date")
    
    # Filter by printerCode
    log(f"2) GET /api/maintenance?printerCode={printer_code}")
    r = requests.get(f"{BASE_URL}/maintenance?printerCode={printer_code}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    logs = r.json()
    for l in logs:
        assert l['printerCode'] == printer_code, f"Expected printerCode={printer_code}, got {l['printerCode']}"
    log(f"✅ Filter by printerCode: {len(logs)} logs")
    
    # Filter by type
    log("3) GET /api/maintenance?type=head_cleaning")
    r = requests.get(f"{BASE_URL}/maintenance?type=head_cleaning")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    logs = r.json()
    for l in logs:
        assert l['type'] == 'head_cleaning', f"Expected type=head_cleaning, got {l['type']}"
    log(f"✅ Filter by type: {len(logs)} logs")
    
    # Filter by limit
    log("4) GET /api/maintenance?limit=1")
    r = requests.get(f"{BASE_URL}/maintenance?limit=1")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    logs = r.json()
    assert len(logs) == 1, f"Expected 1 log, got {len(logs)}"
    log("✅ Filter by limit: 1 log")
    
    log("✅ LIST LOGS TESTS PASSED")

def test_maintenance_get_by_id(log_id):
    """Test 2.6: GET /api/maintenance/:id"""
    test_group("MAINTENANCE: Get By ID")
    
    log(f"GET /api/maintenance/{log_id}")
    r = requests.get(f"{BASE_URL}/maintenance/{log_id}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    log_data = r.json()
    
    # Verify no _id field
    assert '_id' not in log_data, "Response should not contain _id"
    assert log_data['id'] == log_id, f"Expected id={log_id}, got {log_data['id']}"
    
    log(f"✅ Get by ID: {log_data['printerCode']} - {log_data['typeLabel']}")
    
    # Test non-existent ID
    log("GET /api/maintenance/non-existent-id")
    r = requests.get(f"{BASE_URL}/maintenance/non-existent-id")
    assert r.status_code == 404, f"Expected 404 for non-existent ID, got {r.status_code}"
    assert "log no encontrado" in r.text, "Expected 'log no encontrado' error"
    log("✅ Non-existent ID rejected")
    
    log("✅ GET BY ID TESTS PASSED")

def test_maintenance_update(log_id):
    """Test 2.7: PATCH /api/maintenance/:id"""
    test_group("MAINTENANCE: Update Log")
    
    # Update cost and notes
    log(f"1) PATCH /api/maintenance/{log_id} (cost + notes)")
    payload = {
        "cost": 7500,
        "notes": "updated by backend test"
    }
    r = requests.patch(f"{BASE_URL}/maintenance/{log_id}", json=payload)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    
    assert data['log']['cost'] == 7500, f"Expected cost=7500, got {data['log']['cost']}"
    assert data['log']['notes'] == "updated by backend test", f"Expected updated notes"
    log(f"✅ Updated cost to 7500 and notes")
    
    # Update type and verify typeLabel recalculation
    log(f"2) PATCH /api/maintenance/{log_id} (type)")
    payload = {"type": "repair"}
    r = requests.patch(f"{BASE_URL}/maintenance/{log_id}", json=payload)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    
    assert data['log']['type'] == "repair", f"Expected type=repair"
    assert data['log']['typeLabel'] == "Reparación / correctivo", \
        f"Expected typeLabel='Reparación / correctivo', got {data['log']['typeLabel']}"
    log(f"✅ Updated type to 'repair', typeLabel recalculated")
    
    log("✅ UPDATE LOG TESTS PASSED")

def test_maintenance_timeline():
    """Test 2.8: GET /api/maintenance/timeline/:code"""
    test_group("MAINTENANCE: Timeline")
    
    # Get a printer code
    r = requests.get(f"{BASE_URL}/printers")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    printers = r.json()
    printer_code = printers[0]['code']
    
    log(f"GET /api/maintenance/timeline/{printer_code}")
    r = requests.get(f"{BASE_URL}/maintenance/timeline/{printer_code}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    
    # Verify required fields
    assert 'printer' in data, "Missing 'printer' field"
    assert 'events' in data, "Missing 'events' field"
    assert 'stats' in data, "Missing 'stats' field"
    
    # Verify stats fields
    stats = data['stats']
    assert 'totalEvents' in stats, "Missing 'totalEvents' field"
    assert 'totalCost' in stats, "Missing 'totalCost' field"
    assert 'byType' in stats, "Missing 'byType' field"
    assert 'lastEvent' in stats, "Missing 'lastEvent' field"
    assert 'nextDue' in stats, "Missing 'nextDue' field"
    
    # Verify events sorted DESC by date
    events = data['events']
    if len(events) > 1:
        dates = [datetime.fromisoformat(e['date'].replace('Z', '+00:00')) for e in events]
        assert dates == sorted(dates, reverse=True), "Events not sorted DESC by date"
    
    # Verify totalCost == sum of all events' cost
    expected_cost = sum(e['cost'] for e in events)
    assert stats['totalCost'] == expected_cost, \
        f"totalCost mismatch: {stats['totalCost']} != {expected_cost}"
    
    # Verify totalEvents == events.length
    assert stats['totalEvents'] == len(events), \
        f"totalEvents mismatch: {stats['totalEvents']} != {len(events)}"
    
    log(f"✅ Timeline: {stats['totalEvents']} events, totalCost=${stats['totalCost']}")
    log("✅ TIMELINE TESTS PASSED")

def test_maintenance_alerts():
    """Test 2.9: GET /api/maintenance/alerts"""
    test_group("MAINTENANCE: Alerts")
    
    log("GET /api/maintenance/alerts")
    r = requests.get(f"{BASE_URL}/maintenance/alerts")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    
    # Verify required fields
    assert 'now' in data, "Missing 'now' field"
    assert 'overdue' in data, "Missing 'overdue' field"
    assert 'dueSoon' in data, "Missing 'dueSoon' field"
    assert 'dueLater' in data, "Missing 'dueLater' field"
    assert 'counts' in data, "Missing 'counts' field"
    
    # Verify counts match array lengths
    assert data['counts']['overdue'] == len(data['overdue']), \
        f"overdue count mismatch: {data['counts']['overdue']} != {len(data['overdue'])}"
    assert data['counts']['dueSoon'] == len(data['dueSoon']), \
        f"dueSoon count mismatch: {data['counts']['dueSoon']} != {len(data['dueSoon'])}"
    assert data['counts']['dueLater'] == len(data['dueLater']), \
        f"dueLater count mismatch: {data['counts']['dueLater']} != {len(data['dueLater'])}"
    
    # Verify each alert entry has required fields
    for alert in data['overdue'] + data['dueSoon'] + data['dueLater']:
        assert 'printerCode' in alert, "Missing 'printerCode' field"
        assert 'printerName' in alert, "Missing 'printerName' field"
        assert 'type' in alert, "Missing 'type' field"
        assert 'typeLabel' in alert, "Missing 'typeLabel' field"
        assert 'lastDate' in alert, "Missing 'lastDate' field"
        assert 'nextDueDate' in alert, "Missing 'nextDueDate' field"
        assert 'daysUntilDue' in alert, "Missing 'daysUntilDue' field"
    
    log(f"✅ Alerts: overdue={data['counts']['overdue']}, dueSoon={data['counts']['dueSoon']}, dueLater={data['counts']['dueLater']}")
    log("✅ ALERTS TESTS PASSED")

def test_maintenance_kpis():
    """Test 2.10: GET /api/maintenance/kpis"""
    test_group("MAINTENANCE: KPIs")
    
    log("GET /api/maintenance/kpis?days=90")
    r = requests.get(f"{BASE_URL}/maintenance/kpis?days=90")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    
    # Verify required fields
    assert 'periodDays' in data, "Missing 'periodDays' field"
    assert data['periodDays'] == 90, f"Expected periodDays=90, got {data['periodDays']}"
    assert 'totalEvents' in data, "Missing 'totalEvents' field"
    assert 'totalCost' in data, "Missing 'totalCost' field"
    assert 'byPrinter' in data, "Missing 'byPrinter' field"
    assert 'byType' in data, "Missing 'byType' field"
    assert 'mtbf' in data, "Missing 'mtbf' field"
    
    # Verify byPrinter entries
    for entry in data['byPrinter']:
        assert 'printerCode' in entry, "Missing 'printerCode' field"
        assert 'printerName' in entry, "Missing 'printerName' field"
        assert 'events' in entry, "Missing 'events' field"
        assert 'cost' in entry, "Missing 'cost' field"
        assert 'corrective' in entry, "Missing 'corrective' field"
    
    # Verify byType entries
    for entry in data['byType']:
        assert 'type' in entry, "Missing 'type' field"
        assert 'label' in entry, "Missing 'label' field"
        assert 'count' in entry, "Missing 'count' field"
        assert 'cost' in entry, "Missing 'cost' field"
    
    # MTBF might be empty if fewer than 2 repair events per printer
    log(f"✅ KPIs: totalEvents={data['totalEvents']}, totalCost=${data['totalCost']}, mtbf entries={len(data['mtbf'])}")
    log("✅ KPIS TESTS PASSED")

def test_maintenance_delete():
    """Test 2.11: DELETE /api/maintenance/:id"""
    test_group("MAINTENANCE: Delete Logs")
    
    # Delete all created logs
    for log_id in created_log_ids:
        log(f"DELETE /api/maintenance/{log_id}")
        r = requests.delete(f"{BASE_URL}/maintenance/{log_id}")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data['ok'] == True, "Expected ok=true"
        assert data['deleted'] == True, "Expected deleted=true"
        log(f"✅ Deleted log {log_id}")
    
    # Try to delete non-existent ID
    log("DELETE /api/maintenance/non-existent-id")
    r = requests.delete(f"{BASE_URL}/maintenance/non-existent-id")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    assert data['ok'] == True, "Expected ok=true"
    assert data['deleted'] == False, "Expected deleted=false"
    log("✅ Non-existent ID returns deleted=false")
    
    log("✅ DELETE LOGS TESTS PASSED")

def test_maintenance_supplies_consumption():
    """Test 2.12: Supplies consumption integration (optional)"""
    test_group("MAINTENANCE: Supplies Consumption")
    
    # Get a supply
    log("Getting supply from /api/inventory/supplies")
    r = requests.get(f"{BASE_URL}/inventory/supplies")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    supplies = r.json()
    
    if len(supplies) == 0:
        log("⚠️  No supplies found, skipping supplies consumption test")
        return
    
    supply = supplies[0]
    supply_id = supply['id']
    initial_stock = supply.get('currentQuantity', 0)
    
    log(f"Using supply: {supply['name']}, initial stock={initial_stock}")
    
    # Get a printer code
    r = requests.get(f"{BASE_URL}/printers")
    printers = r.json()
    printer_code = printers[0]['code']
    
    # Create maintenance log with supplies consumption
    log("POST /api/maintenance with suppliesConsumed")
    payload = {
        "printerCode": printer_code,
        "type": "head_cleaning",
        "cost": 1000,
        "notes": "test supplies consumption",
        "suppliesConsumed": [
            {"supplyId": supply_id, "quantity": 5}
        ]
    }
    r = requests.post(f"{BASE_URL}/maintenance", json=payload)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    log_id = data['log']['id']
    created_log_ids.append(log_id)
    
    # Verify supply stock was decremented
    log(f"Verifying supply stock was decremented")
    r = requests.get(f"{BASE_URL}/inventory/supplies")
    supplies = r.json()
    updated_supply = next((s for s in supplies if s['id'] == supply_id), None)
    assert updated_supply is not None, "Supply not found after consumption"
    
    expected_stock = max(0, initial_stock - 5)
    assert updated_supply.get('currentQuantity', 0) == expected_stock, \
        f"Expected stock={expected_stock}, got {updated_supply.get('currentQuantity', 0)}"
    
    log(f"✅ Supply stock decremented: {initial_stock} → {updated_supply.get('currentQuantity', 0)}")
    
    # Verify stock_movement was created
    log("Verifying stock_movement was created")
    r = requests.get(f"{BASE_URL}/stock-movements?limit=1")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    movements = r.json()
    
    if len(movements) > 0:
        latest = movements[0]
        if latest['reference'] == 'maintenance' and latest['referenceId'] == log_id:
            log(f"✅ Stock movement created: reference=maintenance, referenceId={log_id}")
        else:
            log(f"⚠️  Latest stock movement not for this maintenance log")
    
    log("✅ SUPPLIES CONSUMPTION TEST PASSED")

# ============================================================================
# REGRESSION TESTS
# ============================================================================

def test_regressions():
    """Test 3: Verify no regressions on other modules"""
    test_group("REGRESSION TESTS")
    
    endpoints = [
        "/products",
        "/orders",
        "/whatsapp/status",
        "/email/status",
        "/pre-press/status",
        "/agent/config",
        "/dashboard/summary"
    ]
    
    for endpoint in endpoints:
        log(f"GET /api{endpoint}")
        r = requests.get(f"{BASE_URL}{endpoint}")
        assert r.status_code == 200, f"Expected 200 for {endpoint}, got {r.status_code}"
        log(f"✅ {endpoint} working")
    
    log("✅ ALL REGRESSION TESTS PASSED")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    print("\n" + "="*80)
    print("  BACKEND TESTING: REPORTS & MAINTENANCE MODULES")
    print("  Estampados DLV - Analytics & Maintenance Tracking")
    print("="*80)
    print(f"\nBase URL: {BASE_URL}")
    print(f"Test started: {datetime.now().isoformat()}\n")
    
    try:
        # REPORTS MODULE
        test_reports_overview()
        test_reports_sales_timeseries()
        test_reports_top_products()
        test_reports_production()
        test_reports_inventory_alerts()
        test_reports_agent()
        test_reports_channels()
        test_reports_method_not_allowed()
        
        # MAINTENANCE MODULE
        test_maintenance_types()
        log_id = test_maintenance_create()
        test_maintenance_list(log_id)
        test_maintenance_get_by_id(log_id)
        test_maintenance_update(log_id)
        test_maintenance_timeline()
        test_maintenance_alerts()
        test_maintenance_kpis()
        test_maintenance_supplies_consumption()
        test_maintenance_delete()
        
        # REGRESSIONS
        test_regressions()
        
        print("\n" + "="*80)
        print("  ✅ ALL TESTS PASSED")
        print("="*80)
        print(f"\nTest completed: {datetime.now().isoformat()}")
        print(f"Total test groups: 21")
        print(f"Reports tests: 8 groups")
        print(f"Maintenance tests: 12 groups")
        print(f"Regression tests: 1 group")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        raise

if __name__ == "__main__":
    main()
