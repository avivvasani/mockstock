import json
import os
import time
import threading
from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from datetime import datetime

# --- Configuration ---
PORT = 16000
# Serve from current directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_FILE = os.path.join(BASE_DIR, 'prices.json') 

# Hardcoded credentials
USERS = {
    "Testing": "Testing123",
    "Admin": "Admin123"
}

app = Flask(__name__)
CORS(app)

# In-memory history storage
# Structure: { "Category Name": [{ "time": ISO_TIMESTAMP, "price": AVG_PRICE }, ...] }
history_data = {}
MAX_HISTORY_POINTS = 600
history_lock = threading.Lock()

def get_stock_prices():
    try:
        if not os.path.exists(JSON_FILE):
            return {"error": "Price data file not found", "stocks": {}}
        with open(JSON_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"error": "Price data unavailable", "stocks": {}}

def update_history_loop():
    """Background thread to calculate category averages and store them."""
    global history_data
    while True:
        data = get_stock_prices()
        stocks = data.get('stocks', {})
        
        if stocks:
            timestamp = datetime.now().isoformat()
            with history_lock:
                for category, category_stocks in stocks.items():
                    if not category_stocks:
                        continue
                    
                    # Calculate average price for the category
                    prices = [p for p in category_stocks.values() if isinstance(p, (int, float))]
                    if prices:
                        avg_price = sum(prices) / len(prices)
                        
                        if category not in history_data:
                            history_data[category] = []
                        
                        history_data[category].append({
                            "time": timestamp,
                            "price": round(avg_price, 2)
                        })
                        
                        # Keep only the last N points
                        if len(history_data[category]) > MAX_HISTORY_POINTS:
                            history_data[category].pop(0)
                            
        time.sleep(3) # Match the fetcher interval

# --- API Routes ---

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    u, p = data.get('username'), data.get('password')
    if u in USERS and USERS[u] == p:
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Invalid Credentials"}), 401

@app.route('/api/prices', methods=['GET'])
def api_prices():
    return jsonify(get_stock_prices())

@app.route('/api/history', methods=['GET'])
def get_history():
    with history_lock:
        return jsonify(history_data)

# --- Static File Serving ---

@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(BASE_DIR, path)

if __name__ == '__main__':
    # Start the history tracking thread
    tracker_thread = threading.Thread(target=update_history_loop, daemon=True)
    tracker_thread.start()
    
    print(f"Server starting on http://localhost:{PORT}")
    app.run(debug=True, port=PORT, host='0.0.0.0', use_reloader=False)
