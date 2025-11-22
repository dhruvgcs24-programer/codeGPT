import joblib

MODEL_PATH = "models/disease_model.pkl"

def load_model():
    return joblib.load(MODEL_PATH)
