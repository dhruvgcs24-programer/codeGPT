from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
import json, os

auth_bp = Blueprint("auth_routes", __name__)

USER_DB = "data/users.json"

def load_users():
    if not os.path.exists(USER_DB):
        return {}
    return json.load(open(USER_DB))

def save_users(users):
    json.dump(users, open(USER_DB, "w"))

@auth_bp.post("/signup")
def signup():
    data = request.json
    email = data["email"]
    password = data["password"]

    users = load_users()

    if email in users:
        return jsonify({"status": "error", "message": "User already exists"})

    users[email] = generate_password_hash(password)
    save_users(users)

    return jsonify({"status": "success"})

@auth_bp.post("/login")
def login():
    data = request.json
    users = load_users()

    if data["email"] not in users:
        return jsonify({"status": "error", "message": "User not found"})

    if not check_password_hash(users[data["email"]], data["password"]):
        return jsonify({"status": "error", "message": "Incorrect password"})

    session["user"] = data["email"]
    return jsonify({"status": "success"})

@auth_bp.get("/auth_check")
def auth_check():
    return jsonify({"status": "ok" if "user" in session else "not_logged_in"})
