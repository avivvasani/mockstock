import json
import os # Import the os module for path manipulation
from flask import Flask, jsonify, render_template
from flask_cors import CORS

# --- Configuration ---
PORT = 16000
# Define the directory path where your data and HTML file reside
# This is the path to '/home/kali/Desktop/mock-stock/public/'
PUBLIC_DIR = '/home/kali/Desktop/mock-stock/public'
JSON_FILE = os.path.join(PUBLIC_DIR, 'prices.json') # Full path to prices.json

# --- Flask App Initialization ---
# 1. Set the 'template_folder' to PUBLIC_DIR so Flask looks there for 'index.html'.
# 2. Set the 'static_folder' to PUBLIC_DIR if you have any CSS/JS/images in that folder.
app = Flask(__name__, 
            template_folder=PUBLIC_DIR, 
            static_folder=PUBLIC_DIR)
CORS(app) # Enable CORS for all routes

# --- Helper Function ---
def get_stock_prices():
    """Reads the latest stock prices from the JSON file."""
    try:
        with open(JSON_FILE, 'r') as f:
            data = json.load(f)
        return data
    except FileNotFoundError:
        # Handle case where the file hasn't been created yet
        return {"error": f"{os.path.basename(JSON_FILE)} not found at {JSON_FILE}"}
    except json.JSONDecodeError:
        # Handle case where the file is corrupted or empty
        return {"error": f"Invalid JSON format in {os.path.basename(JSON_FILE)}"}

# --- Endpoints ---

# Endpoint to serve the raw JSON data (for client-side fetching)
@app.route('/api/prices', methods=['GET'])
def api_prices():
    """Returns the stock prices as a JSON response."""
    return jsonify(get_stock_prices())

# Optional: Endpoint to serve an HTML page that displays the data
@app.route('/')
def index():
    """Renders the main HTML page."""
    # Flask will now look for 'index.html' inside the PUBLIC_DIR
    return render_template('index.html', prices=get_stock_prices())

# --- Run the App ---
if __name__ == '__main__':
    # Ensure you install Flask: pip install Flask
    # host='0.0.0.0' makes it accessible from your local network, not just localhost
    app.run(debug=True, port=PORT, host='0.0.0.0')
