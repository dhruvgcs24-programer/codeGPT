import json
from services.health_rules import analyze_medical_edges

LOG_FILE = "data/triage_log.json"

def save_triage_log(entry):
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
