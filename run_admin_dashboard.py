from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ✅ HTML frontend served by Flask
ADMIN_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Admin — Escrow Dashboard</title>
</head>
<body>
  <h1>Admin — Escrow Dashboard</h1>

  <!-- Admin Token -->
  <label for="token">Admin token</label><br>
  <input type="text" id="token" placeholder="demo_admin_token" style="width:400px"><br><br>

  <!-- Load Escrow -->
  <h3>View Escrow</h3>
  <input type="text" id="escrowId" placeholder="Escrow ID" style="width:400px">
  <button onclick="loadEscrow()">Load Escrow</button><br><br>

  <!-- Create Escrow -->
  <h3>Create Escrow</h3>
  <input type="text" id="buyerName" placeholder="Buyer name" style="width:400px"><br>
  <input type="text" id="sellerName" placeholder="Seller name" style="width:400px"><br>
  <input type="number" id="amount" placeholder="Amount" style="width:400px"><br>
  <button onclick="createEscrow()">Create Escrow</button><br><br>

  <!-- Confirm Deposit -->
  <h3>Confirm Deposit</h3>
  <input type="text" id="confirmEscrowId" placeholder="Escrow ID" style="width:400px"><br>
  <input type="text" id="tokenConfirm" placeholder="Admin token" style="width:400px"><br>
  <button onclick="confirmDeposit()">Confirm Deposit</button><br><br>

  <script>
    const BASE_URL = "";

    async function loadEscrow() {
      const escrowId = document.getElementById("escrowId").value;
      if (!escrowId) return alert("Enter escrow ID");
      try {
        const res = await fetch(`/getEscrow?id=${escrowId}`);
        const data = await res.json();
        alert(JSON.stringify(data, null, 2));
      } catch (e) {
        alert("Error: " + e);
      }
    }

    async function createEscrow() {
      const buyerName = document.getElementById("buyerName").value;
      const sellerName = document.getElementById("sellerName").value;
      const amount = document.getElementById("amount").value;
      if (!buyerName || !sellerName || !amount) return alert("Fill all fields");
      try {
        const res = await fetch(`/createEscrow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buyerName, sellerName, amount })
        });
        const data = await res.json();
        alert(JSON.stringify(data, null, 2));
      } catch (e) {
        alert("Error: " + e);
      }
    }

    async function confirmDeposit() {
      const escrowId = document.getElementById("confirmEscrowId").value;
      const token = document.getElementById("tokenConfirm").value || document.getElementById("token").value;
      if (!token || !escrowId) return alert("Enter token and escrow ID");
      try {
        const res = await fetch(`/adminConfirmDeposit`, {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ escrowId })
        });
        const data = await res.json();
        alert(JSON.stringify(data, null, 2));
      } catch (e) {
        alert("Error: " + e);
      }
    }
  </script>
</body>
</html>
"""

# --------------------
# Routes
# --------------------
@app.route("/")
def index():
    return render_template_string(ADMIN_HTML)

@app.route("/createEscrow", methods=["POST"])
def create_escrow():
    data = request.get_json()
    buyer = data.get("buyerName")
    seller = data.get("sellerName")
    amount = data.get("amount")
    print(f"✅ Escrow created: {buyer} -> {seller} (${amount})")
    return jsonify({"status": "success", "escrowId": "demo123"})

@app.route("/getEscrow", methods=["GET"])
def get_escrow():
    escrow_id = request.args.get("id")
    print(f"🔍 Fetching escrow: {escrow_id}")
    return jsonify({
        "escrowId": escrow_id,
        "buyer": "John Doe",
        "seller": "Jane Smith",
        "amount": 1500,
        "status": "Pending Deposit"
    })

@app.route("/adminConfirmDeposit", methods=["POST"])
def confirm_deposit():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized"}), 401

    token = auth_header.split(" ")[1]
    if token != "demo_admin_token":
        return jsonify({"error": "Invalid token"}), 403

    data = request.get_json()
    escrow_id = data.get("escrowId")
    print(f"💰 Deposit confirmed for {escrow_id}")
    return jsonify({"status": "deposit confirmed", "escrowId": escrow_id})

# --------------------
# Run server
# --------------------
if __name__ == "__main__":
    print("🚀 Admin dashboard running at http://127.0.0.1:5000")
    app.run(port=5000)
