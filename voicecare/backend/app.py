from flask import Flask
from flask_cors import CORS

app = Flask(__name__)

CORS(app,
     resources={r"/*": {"origins": "*"}},
     supports_credentials=True,
     allow_headers=["Content-Type"],
     methods=["GET", "POST", "OPTIONS"])
