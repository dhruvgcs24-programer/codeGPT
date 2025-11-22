from flask import Blueprint, request, jsonify
import subprocess, os

training_bp = Blueprint("training_routes", __name__)

FEEDBACK_FILE = "data/feedback_log.csv"

@training_bp.post("/feedback")
def add_feedback():
    data = request.json

    header_needed = not os.path.exists(FEEDBACK_FILE)
    with open(FEEDBACK_FILE, "a") as f:
        if header_needed:
            f.write("utterance,predicted,corrected\n")
        f.write(f"{data['utterance']},{data['predicted']},{data['corrected']}\n")

    # Trigger training script
    subprocess.Popen(["python", "training/voicecare_training.py"])

    return jsonify({"status": "ok"})
