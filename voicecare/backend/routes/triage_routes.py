from flask import Blueprint, request, jsonify
from services.analyzer import analyze_text
from services.triage_utils import save_triage_log

triage_bp = Blueprint("triage_routes", __name__)

@triage_bp.post("/analyze")
def analyze():
    utter = request.json.get("utterance", "")
    result = analyze_text(utter)
    return jsonify(result)

@triage_bp.post("/save_log")
def save_log():
    entry = request.json
    save_triage_log(entry)
    return jsonify({"status": "ok"})
