from flask import Blueprint, jsonify
import json, os

analytics_bp = Blueprint("analytics_routes", __name__)

LOG_FILE = "data/triage_log.json"

@analytics_bp.get("/logs")
def get_logs():
    if not os.path.exists(LOG_FILE):
        return jsonify([])

    data = [json.loads(line) for line in open(LOG_FILE)]
    return jsonify(data)
