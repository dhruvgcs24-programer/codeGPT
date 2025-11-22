# backend/services/health_rules.py

def analyze_medical_edges(glucose=None, blood_sugar=None, systolic=None, diastolic=None):
    """
    Deterministic threshold checks for vitals.
    Returns a single string summarizing zero-or-more alerts.
    """
    results = []

    # --- GLUCOSE (fasting) ---
    if glucose is not None:
        try:
            g = float(glucose)
        except Exception:
            results.append("Invalid glucose value.")
        else:
            if g > 600:
                results.append("CRITICAL: Glucose > 600 mg/dL — possible hyperosmolar crisis. Seek emergency care.")
            elif g > 200:
                results.append("Very high glucose (>200 mg/dL) — significant hyperglycemia; contact provider.")
            elif g > 125:
                results.append("High fasting glucose (>125 mg/dL) — possible prediabetes/diabetes; follow-up recommended.")
            elif g < 70:
                results.append("Low glucose (<70 mg/dL) — hypoglycemia risk; consume fast-acting carbs and seek care if severe.")
            else:
                results.append("Glucose within normal range.")

    # --- BLOOD SUGAR (postprandial/random) ---
    if blood_sugar is not None:
        try:
            bs = float(blood_sugar)
        except Exception:
            results.append("Invalid blood sugar value.")
        else:
            if bs > 600:
                results.append("CRITICAL: Blood sugar > 600 mg/dL — possible hyperosmolar emergency. Seek immediate care.")
            elif bs > 200:
                results.append("High blood sugar (>200 mg/dL) — hyperglycemia after meal; consider provider review.")
            else:
                results.append("Blood sugar within expected range.")

    # --- BLOOD PRESSURE ---
    if systolic is not None and diastolic is not None:
        try:
            s = int(systolic)
            d = int(diastolic)
        except Exception:
            results.append("Invalid blood pressure values.")
        else:
            if s > 180 or d > 120:
                results.append("CRISIS: Blood pressure >180/120 — hypertensive emergency. Seek emergency care now.")
            elif s > 140 or d > 90:
                results.append("High blood pressure (Stage 2 hypertension). Contact provider.")
            elif s > 120 or d > 80:
                results.append("Elevated blood pressure. Monitor and consider lifestyle changes.")
            else:
                results.append("Blood pressure within normal limits.")

    if not results:
        return "No medical readings provided."
    return " ".join(results)
