import json
import hashlib
import uuid
import os
import re

# --- GLOBAL STATE (WARNING: NOT PERSISTENT IN REAL LAMBDA) ---
# NOTE: In a real Netlify Function environment (AWS Lambda), this global
# state (users, escrows) will be reset with every new function invocation.
# This code is a direct translation of your Flask app, but for a production
# environment, you MUST use the MongoDB_URI defined in netlify.toml to connect
# to a persistent database.

users = {}
escrows = {}

# Helper functions (copied from your Flask app)
def hash_password(password):
    """Hashes the password using SHA256."""
    return hashlib.sha256(password.encode()).hexdigest()

def generate_user_id():
    """Generates a UUID for the user ID."""
    return str(uuid.uuid4())

def generate_escrow_id():
    """Generates a short 8-character ID for escrow."""
    return str(uuid.uuid4())[:8]

def build_response(status_code, body):
    """Utility to format the Lambda response."""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*', # Necessary for CORS, though Netlify often handles this
        },
        'body': json.dumps(body)
    }

# --- ENDPOINT HANDLERS ---
# The entry point for a Netlify Python function is typically named handler
# The path structure will be /.netlify/functions/escrow_api/signup (or whatever the path is)

def handle_signup(event, context):
    """Handles user sign up via POST request."""
    try:
        data = json.loads(event['body'])
    except:
        return build_response(400, {"error": "Invalid or missing JSON body"})

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return build_response(400, {"error": "Email and password are required"})

    if email in users:
        return build_response(409, {"error": "User already exists"})

    users[email] = {
        "user_id": generate_user_id(),
        "password_hash": hash_password(password)
    }

    return build_response(200, {"status": "success", "user_id": users[email]["user_id"]})

def handle_login(event, context):
    """Handles user login via POST request."""
    try:
        data = json.loads(event['body'])
    except:
        return build_response(400, {"error": "Invalid or missing JSON body"})

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return build_response(400, {"error": "Email and password are required"})

    user = users.get(email)
    if not user or user["password_hash"] != hash_password(password):
        return build_response(401, {"error": "Invalid credentials"})

    # In a real app, you would generate a JWT token here using os.environ.get("JWT_SECRET")
    # For this example, we just return the user ID.
    return build_response(200, {"status": "success", "user_id": user["user_id"]})

def handle_create_escrow(event, context):
    """Handles creation of a new escrow transaction."""
    try:
        data = json.loads(event['body'])
    except:
        return build_response(400, {"error": "Invalid or missing JSON body"})

    terms = data.get("terms")
    if not terms:
        return build_response(400, {"error": "Terms are required"})

    escrow_id = generate_escrow_id()
    wallet = "USDT TRC20 Wallet: TKTVFbMAyEh6p9kydRNfavxy6hEvyfsTBR..." # shortened for brevity
    amount = "100 USDT"

    escrows[escrow_id] = {
        "terms": terms,
        "wallet": wallet,
        "amount": amount,
        "status": "Pending"
    }

    return build_response(200, {
        "escrowId": escrow_id,
        "wallet": wallet,
        "amount": amount
    })


# --- MAIN DISPATCHER ---
# This is a common pattern for handling multiple routes in one Netlify function file.
# The URL path will be like: /.netlify/functions/escrow_api?path=signup
def handler(event, context):
    """
    Main handler function to route requests based on the path.
    The path is usually derived from the function name and folder structure,
    but we can dispatch based on a query parameter or the event path if needed.
    """
    # Simple path routing based on the function name for demonstration
    # In reality, Netlify's URL structure is more rigid.
    # For simplicity, we'll map methods to handlers directly:

    path = event['path']
    http_method = event['httpMethod']

    # Use regex to determine the intended endpoint from the path
    if re.search(r'signup', path) and http_method == 'POST':
        return handle_signup(event, context)
    elif re.search(r'login', path) and http_method == 'POST':
        return handle_login(event, context)
    elif re.search(r'createEscrow', path) and http_method == 'POST':
        return handle_create_escrow(event, context)
    # Add handlers for confirmDeposit, releaseFunds, and myEscrows GET (which needs path parsing)

    return build_response(404, {"error": f"Endpoint not found: {http_method} {path}"})
