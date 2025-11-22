"""
voicecare_training.py
---------------------

FULLY AUTOMATED SELF-TRAINING ENGINE FOR VOICECARE

Features:
- Reads feedback_log.csv
- Extracts entities exactly like api.py
- Requires minimum new feedback before retrain
- Prevents double-running using lock file
- Backs up old models
- Trains new Random Forest model
- Validates model accuracy before replacing
- Clears feedback after successful retrain
"""

import os
import time
import json
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import datetime
import re

# ---------------------------
# CONFIG
# ---------------------------
FEEDBACK_LOG = "feedback_log.csv"
MODEL_FILENAME = "disease_model.pkl"
BACKUP_DIR = "model_backups"
LOCK_FILE = "training.lock"

MIN_NEW_ROWS = 5           # Minimum feedback rows required before training
VALIDATION_SPLIT = 0.2
MIN_ACCEPTABLE_ACCURACY = 0.50  # Must beat this or training aborts
N_TREES = 150

# ---------------------------
# ENTITY EXTRACTOR (synced with API for core model features)
# ---------------------------
def extract_entities(text):
    text = (text or "").lower()

    # NOTE: The model only uses this subset of features from the full API list
    entities = {
        'temp': 98.6,
        'systolic': 120,
        'glucose': 100, # Use a safe default for glucose for the model
        'headache': 0,
        'fatigue': 0,
        'nausea': 0,
        'cough': 0,
        'diarrhea': 0,
        'constipation': 0,
        'body_ache': 0,
    }

    # Temperature
    t = re.search(r'(\d{2,3}(?:\.\d+)?)', text)
    if t:
        val = float(t.group(1))
        if 30 <= val <= 115:
            entities['temp'] = val

    # BP (Only systolic is used by the model)
    bp = re.search(r'(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})', text)
    if bp:
        entities["systolic"] = int(bp.group(1))

    # Glucose
    gl = re.search(r'(glucose|sugar|blood sugar).*?(\d{2,3})', text)
    if gl:
        entities['glucose'] = int(gl.group(2))
    
    # Headache
    if re.search(r'headache|migraine|severe headache', text): entities['headache'] = 1
    
    # Symptoms
    if 'fatigue' in text or 'tired' in text: entities['fatigue'] = 1
    if 'nausea' in text: entities['nausea'] = 1
    if 'cough' in text: entities['cough'] = 1
    if 'diarrhea' in text: entities['diarrhea'] = 1
    if 'constipation' in text: entities['constipation'] = 1
    if 'body ache' in text or 'body pain' in text: entities['body_ache'] = 1

    return entities


# ---------------------------
# ACQUIRE/RELEASE LOCK
# ---------------------------
def acquire_lock():
    if os.path.exists(LOCK_FILE):
        return False
    with open(LOCK_FILE, "w") as f:
        f.write(str(os.getpid()))
    return True

def release_lock():
    if os.path.exists(LOCK_FILE):
        os.remove(LOCK_FILE)

# ---------------------------
# LOAD FEEDBACK
# ---------------------------
def load_feedback():
    if not os.path.exists(FEEDBACK_LOG):
        print("⚠ No feedback found. Training skipped.")
        return pd.DataFrame()

    df = pd.read_csv(FEEDBACK_LOG)

    if "utterance" not in df or "predicted" not in df:
        print("⚠ Feedback file missing required columns.")
        return pd.DataFrame()

    rows = []
    for _, row in df.iterrows():
        # Only extract the core 10 features for training the model
        feats = extract_entities(row["utterance"]) 
        feats["prognosis"] = row.get("corrected", row.get("predicted", "Normal"))
        rows.append(feats)

    return pd.DataFrame(rows)


# ---------------------------
# TRAINING LOGIC
# ---------------------------
def train():
    print("🚀 Starting Self-Training Engine")

    # Prevent parallel runs
    if not acquire_lock():
        print("⚠ Training already running — aborted.")
        return

    try:
        feedback_df = load_feedback()

        if feedback_df.empty or len(feedback_df) < MIN_NEW_ROWS:
            print(f"⚠ Not enough feedback ({len(feedback_df)}) — waiting for more.")
            return

        print(f"📥 Loaded {len(feedback_df)} feedback rows.")

        # Prepare training data
        X = feedback_df.drop(columns=["prognosis"])
        y = feedback_df["prognosis"]

        # Split for validation
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=VALIDATION_SPLIT, random_state=42
        )

        # Train model
        model = RandomForestClassifier(n_estimators=N_TREES, random_state=42)
        model.fit(X_train, y_train)

        # Validate
        preds = model.predict(X_test)
        acc = accuracy_score(y_test, preds)
        print(f"📊 Validation Accuracy: {acc:.2f}")

        if acc < MIN_ACCEPTABLE_ACCURACY:
            print("❌ Model rejected (accuracy too low). Keeping old model.")
            return

        # Backup old model
        os.makedirs(BACKUP_DIR, exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        if os.path.exists(MODEL_FILENAME):
            backup_path = os.path.join(BACKUP_DIR, f"model_{timestamp}.pkl")
            os.rename(MODEL_FILENAME, backup_path)
            print(f"📦 Old model backed up to {backup_path}")

        # Save new
        joblib.dump(model, MODEL_FILENAME)
        print(f"✅ New model promoted: {MODEL_FILENAME}")

        # Clear feedback log
        os.remove(FEEDBACK_LOG)
        print("🧹 Cleared feedback log.")

    finally:
        release_lock()


# ---------------------------
# MAIN
# ---------------------------
if __name__ == "__main__":
    train()
    print("✅ Training process complete.")