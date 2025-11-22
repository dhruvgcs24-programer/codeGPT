import re
import pandas as pd
from services.model_loader import load_model

model = load_model()

def extract_entities(text):
    text = text.lower()

    ent = {
        "temp": 98.6,
        "systolic": 120,
        "glucose": 100,
        "spo2": 98,
        "headache": 0,
        "fatigue": 0,
        "nausea": 0,
        "cough": 0,
        "diarrhea": 0,
        "body_ache": 0
    }

    temp = re.search(r'(9[4-9]|10[0-9]|11[0-5])', text)
    if temp: ent["temp"] = float(temp.group(0))

    spo2 = re.search(r'(8[0-9]|9[0-9])\s*%?', text)
    if spo2: ent["spo2"] = int(spo2.group(1))

    if "headache" in text: ent["headache"] = 1
    if "fatigue" in text: ent["fatigue"] = 1
    if "nausea" in text: ent["nausea"] = 1
    if "cough" in text: ent["cough"] = 1
    if "diarrhea" in text: ent["diarrhea"] = 1
    if "body ache" in text: ent["body_ache"] = 1

    return ent

def analyze_text(utterance):
    ent = extract_entities(utterance)
    df = pd.DataFrame([ent])
    disease = model.predict(df)[0]

    risk = "High" if disease in ["Emergency", "Heart Attack"] else "Medium" if disease in ["Pneumonia", "Dengue"] else "Low"

    return {
        "prognosis": disease,
        "level": risk,
        "message": "AI analysis completed.",
        "vitals": ent,
        "verbal": f"Detected {disease}."
    }
