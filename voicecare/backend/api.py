# backend/api.py
# Final version with Age-aware thresholds, improved temp parsing, safer entity extraction,
# enhanced emergency rules with age-specific thresholds, and detailed triage output.

from flask import session
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd
import re
import logging
import os
import subprocess
import json
from spellchecker import SpellChecker
import datetime

logging.basicConfig(level=logging.INFO)
app = Flask(__name__)
app.secret_key = "supersecurekey123"

CORS(app)

SPELL = SpellChecker()

# -------------------- Load Model -----------------------
MODEL_FILENAME = 'disease_model.pkl'
try:
    disease_model = joblib.load(MODEL_FILENAME)
    logging.info("Model loaded successfully.")
except Exception:
    disease_model = None
    logging.warning("Model not loaded. Using rules only.")

# -------------------- Diagnosis Map ---------------------
DIAGNOSIS_MAP = {
    'Normal': {'level': 'Low', 'color': '#10b981', 'advice': 'Vitals look normal.'},

    'Common Cold': {'level': 'Low', 'color': '#10b981', 'advice': 'Likely common cold. Rest & hydrate.'},
    'Flu': {'level': 'Medium', 'color': '#f59e0b', 'advice': 'Likely flu. Rest & increase fluids.'},

    'Migraine': {
        'level': 'Medium',
        'color': '#f59e0b',
        'advice': 'Likely migraine. Rest in a dark quiet room, hydrate, and consider migraine medication.'
    },

    'Dengue': {'level': 'High', 'color': '#ef4444', 'advice': 'Possible dengue. Seek testing & medical care.'},
    'Malaria': {'level': 'High', 'color': '#ef4444', 'advice': 'Possible malaria. Blood test recommended.'},
    'Typhoid': {'level': 'High', 'color': '#ef4444', 'advice': 'Possible typhoid. Seek evaluation.'},

    'Diarrhea': {'level': 'Medium', 'color': '#f59e0b', 'advice': 'Hydrate. Seek help if persistent.'},
    'Constipation': {'level': 'Low', 'color': '#10b981', 'advice': 'Increase fiber & fluids.'},

    'Food Poisoning': {'level': 'Medium', 'color': '#f59e0b', 'advice': 'Rest & hydrate. Avoid solid foods initially.'},

    'Hypertension': {'level': 'Medium', 'color': '#f59e0b', 'advice': 'BP elevated. Monitor & consult doctor.'},
    'Diabetes': {'level': 'Medium', 'color': '#f59e0b', 'advice': 'Glucose high. Adjust diet & meds.'},

    'Hyperglycemia': {'level': 'High', 'color': '#ef4444', 'advice': 'Dangerously high sugar. Emergency care may be needed.'},
    'Hypoglycemia': {'level': 'High', 'color': '#ef4444', 'advice': 'Low sugar. Eat carbs immediately.'},

    'COVID-19': {'level': 'High', 'color': '#ef4444', 'advice': 'Possible COVID-19. Test & isolate immediately.'},

    'Asthma Exacerbation': {'level': 'High', 'color': '#ef4444', 'advice': 'Asthma flare. Use inhaler & seek urgent care.'},
    'COPD Flare / Respiratory Failure': {'level': 'High', 'color': '#ef4444', 'advice': 'Breathing failure. Emergency.'},
    'Pneumonia': {'level': 'High', 'color': '#ef4444', 'advice': 'Potential pneumonia. Clinical evaluation needed.'},

    'Kidney Risk': {'level': 'High', 'color': '#ef4444', 'advice': 'Possible kidney stress. Check hydration & kidney function.'},

    'Heart Attack': {'level': 'High', 'color': '#ef4444', 'advice': 'Signs of heart attack. Emergency immediately.'},
    'Stroke': {'level': 'High', 'color': '#ef4444', 'advice': 'Possible stroke. Go to emergency hospital.'},

    'Emergency': {'level': 'High', 'color': '#ef4444', 'advice': 'Medical emergency. Seek immediate care.'},
}

# -------------------- Age-Based Tips ---------------------
def get_age_based_tips(age):
    try:
        age = int(age)
    except Exception:
        return "General health: stay hydrated and seek care when unsure."

    if age < 5:
        return "Ensure safe sleep, vaccinations, and adequate hydration. Watch for poor feeding or lethargy."
    elif age < 18:
        return "Get 8-10 hours sleep, limit screen time, and stay active."
    elif age < 50:
        return "Exercise regularly, manage stress, and stay hydrated."
    elif age < 70:
        return "Focus on balance exercises, screenings, and social engagement."
    else:
        return "Prevent falls, maintain medication routine, and stay mentally active."

# -------------------- Spelling Correction ---------------------
def spell_correct_text(text):
    if not text:
        return ""
    words = text.split()
    corrected = [SPELL.correction(w) or w for w in words]
    return " ".join(corrected)

# -------------------- Entity Extraction ---------------------
def extract_entities(text):
    # run spell correction first but avoid changing numbers/units
    corrected_text = spell_correct_text(text)
    text_l = corrected_text.lower()

    entities = {
        'age': 35,
        'temp': None,
        'systolic': 120,
        'glucose': None,
        'spo2': None,

        'headache': 0, 'throbbing': 0, 'aura': 0, 'light_sensitivity': 0, 'sound_sensitivity': 0,
        'fatigue': 0, 'nausea': 0, 'vomiting': 0,
        'cough': 0, 'sore_throat': 0,
        'loss_smell': 0, 'chills': 0, 'sweating': 0,
        'abdominal_pain': 0, 'diarrhea': 0, 'constipation': 0, 'body_ache': 0, 'rash': 0,
        'blood_in_stool': 0, 'reduced_urine': 0, 'swelling': 0,
        'wheezing': 0, 'shortness_breath': 0,
        'dizziness': 0, 'weakness': 0, 'slurred_speech': 0,
    }

    # Age detection
    age_match = re.search(r'(\b\d{1,3})\s*(?:years? old|y/o|y old|y|old)\b', text_l)
    if age_match:
        try:
            age_val = int(age_match.group(1))
            if 0 <= age_val <= 120:
                entities['age'] = age_val
        except Exception:
            pass

    # Temperature detection - prefer explicit temperature mentions
    temp_patterns = [
        r'temp(?:erature)?\D{0,10}(\d{2,3}(?:\.\d+)?)',
        r'fever\D{0,10}(\d{2,3}(?:\.\d+)?)',
        r'(\d{2,3}(?:\.\d+)?)\s?(?:f|c)\b'
    ]
    temp_val = None
    for p in temp_patterns:
        m = re.search(p, text_l)
        if m:
            try:
                temp_val = float(m.group(1))
                break
            except Exception:
                continue

    # If still not found, try to find 'fever' standalone -> assume fever but no number
    if temp_val is None and 'fever' in text_l:
        # set an indicative fever value to allow rule-checking; 100.4 F commonly used
        temp_val = 100.4

    # Validate temp range
    if temp_val and 30 <= temp_val <= 115:
        entities['temp'] = temp_val

    # SPO2 detection
    spo = re.search(r'(?:spo2|oxygen)\D{0,6}(\d{2,3})', text_l)
    if spo:
        try:
            entities['spo2'] = int(spo.group(1))
        except Exception:
            pass

    # BP detection (systolic)
    bp = re.search(r'(\b\d{2,3})\s*(?:/|over)\s*(\d{2,3})\b', text_l)
    if bp:
        try:
            entities['systolic'] = int(bp.group(1))
        except Exception:
            pass

    # Glucose detection
    gl = re.search(r'(?:glucose|sugar|blood sugar)\D{0,6}(\d{2,3})', text_l)
    if gl:
        try:
            entities['glucose'] = int(gl.group(1))
        except Exception:
            pass

    # Symptoms detection (simple substring match)
    keywords = {
        'headache': 'headache', 'migraine': 'headache',
        'throbbing': 'throbbing', 'pulsating': 'throbbing',
        'aura': 'aura', 'flashing lights': 'aura',
        'photophobia': 'light_sensitivity', 'light sensitivity': 'light_sensitivity',
        'phonophobia': 'sound_sensitivity', 'sound sensitivity': 'sound_sensitivity',
        'fatigue': 'fatigue', 'tired': 'fatigue',
        'nausea': 'nausea', 'vomit': 'vomiting',
        'cough': 'cough', 'sore throat': 'sore_throat',
        'loss of smell': 'loss_smell', "can't smell": 'loss_smell', 'cant smell': 'loss_smell',
        'chills': 'chills', 'sweating': 'sweating',
        'abdominal pain': 'abdominal_pain', 'stomach pain': 'abdominal_pain',
        'diarrhea': 'diarrhea', 'constipation': 'constipation',
        'body ache': 'body_ache', 'bodyache': 'body_ache', 'rash': 'rash',
        'blood in stool': 'blood_in_stool',
        'not peeing': 'reduced_urine', 'reduced urine': 'reduced_urine',
        'swelling': 'swelling', 'wheezing': 'wheezing',
        'breathless': 'shortness_breath', "can't breathe": 'shortness_breath', 'cant breathe': 'shortness_breath',
        'dizzy': 'dizziness', 'weak': 'weakness',
        'slurred speech': 'slurred_speech'
    }

    for kw, key in keywords.items():
        if kw in text_l:
            entities[key] = 1

    return entities

# ------------------- Emergency & Disease Logic ----------------------
def emergency_rules(utter, e):
    u = utter.lower()
    age = e.get('age', 35)
    temp = e.get('temp')
    spo2 = e.get('spo2')

    # Helper: age-aware fever emergency thresholds
    # - children under 5: fever >= 100 F -> emergency (per user request)
    # - age >=5 : fever >= 102 F -> emergency
    # Keep absolute very high fever as emergency for all (>=103.5)
    try:
        if temp is not None:
            if temp >= 103.5:
                return "Emergency"
            if age < 5 and temp >= 100:
                return "Emergency"
            if age >= 5 and temp >= 102:
                return "Emergency"
    except Exception:
        pass

    # Stroke: slurred speech OR older patient with weakness+headache
    if e.get('slurred_speech') or (e.get('weakness') and e.get('headache') and age >= 60):
        return "Stroke"

    # Heart attack: chest pain radiating to left arm/jaw in older adults
    if re.search(r'chest pain|radiating|left arm|jaw pain', u) and age >= 50:
        return "Heart Attack"

    # COVID handling
    if re.search(r'\bcovid\b|corona|tested positive', u):
        if e.get('shortness_breath') or (spo2 and spo2 < 95) or age >= 65:
            return "Emergency"
        return "COVID-19"

    # Immunosuppressed or serious infections keywords
    if re.search(r'\bhiv\b|\baids\b|immunodeficiency|cd4', u):
        return "Emergency"
    if re.search(r'\btb\b|tuberculosis', u):
        return "Emergency"

    # Pneumonia: cough + fever + shortness of breath OR low spo2
    # Be slightly more conservative for young children (use spo2 < 95 for <5)
    if ((temp and temp >= 100 and e.get('cough') and e.get('shortness_breath'))
            or (spo2 and ((age < 5 and spo2 < 95) or (age >= 5 and spo2 < 94)))):
        return "Pneumonia"

    # Dengue: fever + body ache + (rash or nausea) - children may present atypically,
    # but here we keep same logic and previously high-temp checks already handled above
    if temp and temp >= 100 and e.get('body_ache') and (e.get('rash') or e.get('nausea')):
        return "Dengue"

    # Malaria: fever with chills/sweating in endemic setting
    if temp and temp >= 100 and e.get('chills') and e.get('sweating'):
        return "Malaria"

    # Typhoid: fever + abdominal pain + (diarrhea or constipation)
    if temp and temp >= 100 and e.get('abdominal_pain') and (e.get('diarrhea') or e.get('constipation')):
        return "Typhoid"

    # Food poisoning: vomiting + diarrhea
    if e.get('vomiting') and e.get('diarrhea'):
        return "Food Poisoning"

    # Asthma exacerbation
    if e.get('wheezing') and e.get('shortness_breath'):
        return "Asthma Exacerbation"

    # COPD flare / respiratory failure
    if spo2 and spo2 < 92:
        return "COPD Flare / Respiratory Failure"

    # Glucose emergencies
    if e.get('glucose') and e.get('glucose') >= 350:
        return "Hyperglycemia"
    if e.get('glucose') and e.get('glucose') <= 60:
        return "Hypoglycemia"

    # Kidney risk
    if e.get('reduced_urine') and (e.get('diarrhea') or e.get('vomiting')):
        return "Kidney Risk"

    # Migraine
    if e.get('headache') and (e.get('throbbing') or e.get('aura') or e.get('light_sensitivity') or e.get('sound_sensitivity')):
        return "Migraine"

    # High but non-emergent fever -> Flu
    if temp and 100 <= temp < 103.5 and (e.get('body_ache') or e.get('fatigue') or e.get('cough')):
        return "Flu"

    return None

# -------------------- ANALYZE (UPDATED WITH AGE-AWARE TRIAGE LOGGING) ---------------------
@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json or {}
    utterance = data.get('utterance', '')
    e = extract_entities(utterance)

    predicted = emergency_rules(utterance, e)

    if not predicted:
        if disease_model:
            try:
                df = pd.DataFrame([{
                    'age': e['age'], 'temp': e['temp'] or 0,
                    'systolic': e['systolic'],
                    'glucose': e['glucose'] or 0,
                    'headache': e['headache'], 'fatigue': e['fatigue'],
                    'nausea': e['nausea'], 'cough': e['cough'],
                    'diarrhea': e['diarrhea'], 'constipation': e['constipation'],
                    'body_ache': e['body_ache']
                }])
                predicted = disease_model.predict(df)[0]
            except Exception:
                predicted = "Normal"
        else:
            predicted = "Normal"

    diag = DIAGNOSIS_MAP.get(predicted, DIAGNOSIS_MAP['Normal'])
    age_tip = get_age_based_tips(e['age'])

    verbal = (
        f"My analysis suggests: {predicted}. {diag['advice']} "
        f"Additionally, here is an age-appropriate health tip: {age_tip}"
    )

    # -------------------- AUTO-TRIAGE LOGGING --------------------
    triage_entry = {
        "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "utterance": utterance,
        "diagnosis": predicted,
        "risk": diag['level'],
        "color": diag['color'],
        "advice": diag['advice'],
        "age_tip": age_tip,
        "vitals": e
    }

    try:
        with open("triage_log.json", "a", encoding="utf-8") as f:
            f.write(json.dumps(triage_entry) + "\n")
    except Exception as ex:
        logging.warning(f"Failed to write triage log: {ex}")
    # -------------------------------------------------------------

    return jsonify({
        "prognosis": predicted,
        "level": diag['level'],
        "message": diag['advice'],
        "verbal": verbal,
        "age_tip": age_tip,
        "vitals": e
    })

# -------------------- LOG ENDPOINTS ---------------------
@app.route('/logs', methods=['GET'])
def logs():
    if not os.path.exists("triage_log.json"):
        return jsonify([])

    try:
        with open("triage_log.json", "r", encoding="utf-8") as f:
            return jsonify([json.loads(line) for line in f.read().splitlines()])
    except Exception as ex:
        logging.warning(f"Failed to read triage_log.json: {ex}")
        return jsonify([])

@app.route('/save_log', methods=['POST'])
def save_log():
    entry = request.json
    try:
        with open("triage_log.json", "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as ex:
        logging.warning(f"Failed to save log: {ex}")
        return jsonify({"status": "error", "message": str(ex)}), 500
    return jsonify({"status": "ok"})

@app.route('/preload', methods=['GET'])
def preload():
    if not os.path.exists("triage_log.json"):
        return jsonify([])

    try:
        with open("triage_log.json", "r", encoding="utf-8") as f:
            return jsonify([json.loads(line) for line in f.read().splitlines()])
    except Exception as ex:
        logging.warning(f"Failed to preload triage_log.json: {ex}")
        return jsonify([])

# ----------------------- FEEDBACK --------------------------
@app.route('/feedback', methods=['POST'])
def feedback():
    fb = request.json or {}
    logfile = 'feedback_log.csv'
    write_header = not os.path.exists(logfile)

    try:
        with open(logfile, "a", encoding="utf-8") as f:
            if write_header:
                f.write("utterance,predicted,corrected,confirmed,age,temp,systolic,glucose,spo2\n")

            f.write(
                f'"{fb.get("utterance","")}",{fb.get("predicted","")},{fb.get("corrected","")},'
                f'{fb.get("confirmed",True)},{fb.get("vitals",{}).get("age","")},'
                f'{fb.get("vitals",{}).get("temp","")},{fb.get("vitals",{}).get("systolic","")},'
                f'{fb.get("vitals",{}).get("glucose","")},{fb.get("vitals",{}).get("spo2","")}\n'
            )
    except Exception as ex:
        logging.warning(f"Failed to write feedback: {ex}")

    try:
        subprocess.Popen(['python', 'voicecare_training.py'])
    except Exception as e:
        logging.warning(f"Training spawn failed: {e}")

    return jsonify({"status": "ok", "message": "Feedback saved."})

# ----------------------- RUN SERVER --------------------------
if __name__ == '__main__':
    app.run(debug=True, port=5000)
