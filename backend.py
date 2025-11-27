#!/usr/bin/env python3
"""
Simple local Flask backend for writeups-tracker
- Caches https://pentester.land/writeups.json as writeups.json
- Stores userdata in userdata.json
- Serves static frontend from ./static/
- Local only (127.0.0.1)
"""
from flask import Flask, jsonify, request, send_from_directory, abort
import os, json, requests, datetime, threading

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(ROOT, "static")
WRITEUPS_PATH = os.path.join(ROOT, "writeups.json")
USERDATA_PATH = os.path.join(ROOT, "userdata.json")
PENTESTER_URL = "https://pentester.land/writeups.json"

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')

def ensure_files():
    # Ensure userdata exists
    if not os.path.exists(USERDATA_PATH):
        print("Creating userdata.json with default structure...")
        default = {
            "read": {},         # map url -> ISO timestamp when marked read
            "settings": {
                "dark": False,
                "sort": "date_desc",   # date_desc, date_asc, title, author
                "weekly_goal": 10
            }
        }
        with open(USERDATA_PATH, "w") as f:
            json.dump(default, f, indent=2)

    # Ensure writeups cached locally; try to fetch if missing or empty
    if not os.path.exists(WRITEUPS_PATH) or os.path.getsize(WRITEUPS_PATH) == 0:
        print("No local writeups.json found — attempting to fetch from pentester.land ...")
        try:
            r = requests.get(PENTESTER_URL, timeout=10)
            if r.status_code == 200:
                with open(WRITEUPS_PATH, "wb") as f:
                    f.write(r.content)
                print("Fetched and cached writeups.json")
            else:
                print("Failed to fetch writeups.json (status {})".format(r.status_code))
                open(WRITEUPS_PATH, "w").write("[]")
        except Exception as e:
            print("Error fetching writeups.json:", e)
            open(WRITEUPS_PATH, "w").write("[]")

@app.route('/')
def index():
    return send_from_directory(STATIC_DIR, "index.html")

@app.route('/<path:filename>')
def static_proxy(filename):
    # serve static files
    file_path = os.path.join(STATIC_DIR, filename)
    if os.path.exists(file_path):
        return send_from_directory(STATIC_DIR, filename)
    abort(404)

@app.route('/api/writeups', methods=['GET'])
def api_writeups():
    """
    Return the cached writeups.json content as a plain array.
    If writeups.json is an object with a top-level "data" key, unwrap it.
    """
    # Ensure writeups file exists
    if not os.path.exists(WRITEUPS_PATH):
        ensure_files()
    try:
        with open(WRITEUPS_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
        # If the cached file is {"data": [...]}, unwrap it
        if isinstance(raw, dict) and "data" in raw and isinstance(raw["data"], list):
            data = raw["data"]
        elif isinstance(raw, list):
            data = raw
        else:
            # Unexpected shape -> try best effort to find a list
            for v in raw.values() if isinstance(raw, dict) else []:
                if isinstance(v, list):
                    data = v
                    break
            else:
                data = []
        return jsonify(data)
    except Exception as e:
        # On error, return empty array to frontend
        return jsonify([])


@app.route('/api/update_writeups', methods=['POST'])
def api_update_writeups():
    """
    Attempt to re-fetch latest writeups from pentester.land and replace local cache.
    Returns status.
    """
    try:
        r = requests.get(PENTESTER_URL, timeout=10)
        if r.status_code == 200:
            with open(WRITEUPS_PATH, "wb") as f:
                f.write(r.content)
            return jsonify({"ok": True, "message": "Fetched and replaced local writeups.json"})
        else:
            return jsonify({"ok": False, "message": f"Received status {r.status_code}"})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500

@app.route('/api/data', methods=['GET', 'POST'])
def api_data():
    """
    GET - return userdata.json
    POST - replace userdata.json (expect JSON body)
    """
    if request.method == 'GET':
        if not os.path.exists(USERDATA_PATH):
            ensure_files()
        with open(USERDATA_PATH, "r", encoding="utf-8") as f:
            return jsonify(json.load(f))
    else:
        try:
            payload = request.get_json(force=True)
            # Basic validation: must be a dict
            if not isinstance(payload, dict):
                return jsonify({"ok": False, "message": "userdata must be an object"}), 400
            with open(USERDATA_PATH, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"ok": False, "message": str(e)}), 500

def start_background_ensure():
    # Run ensure_files in background thread to avoid long startup delays
    def run():
        try:
            ensure_files()
        except Exception:
            pass
    t = threading.Thread(target=run, daemon=True)
    t.start()

if __name__ == "__main__":
    start_background_ensure()
    print("Starting writeups-tracker backend on http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
