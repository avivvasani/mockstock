import json
import os 
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

# --- Configuration ---
PORT = 16000
PUBLIC_DIR = '/home/kali/Desktop/mock-stock/public'
JSON_FILE = os.path.join(PUBLIC_DIR, 'prices.json') 

# Hardcoded credentials as requested
USERS = {
    "Testing": "Testing123",
    "Admin": "Admin123"
}

app = Flask(__name__, 
            template_folder=PUBLIC_DIR, 
            static_folder=PUBLIC_DIR)
CORS(app) 

def get_stock_prices():
    try:
        with open(JSON_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"error": "Price data unavailable"}

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

@app.route('/')
def index():
    return render_template('index.html', prices=get_stock_prices())

if __name__ == '__main__':
    app.run(debug=True, port=PORT, host='0.0.0.0')
