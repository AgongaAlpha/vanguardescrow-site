const jwt = require("jsonwebtoken");
const { query } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const DEFAULT_SELLER_ID = 100;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: HEADERS, body: "CORS Preflight Success" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let decoded;
  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Authorization token required." }) };
    }

    const token = authHeader.substring(7);
    decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded || !decoded.user_id) {
      return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Invalid token payload (missing user ID)." }) };
    }

    if (decoded.role !== "buyer") {
      return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: "Forbidden: Only buyers can create escrows." }) };
    }
  } catch (err) {
    console.error("Token validation error:", err);
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Invalid or expired token." }) };
  }

  try {
    const { amount, description, paymentMethod } = JSON.parse(event.body);
    const buyer_id = decoded.user_id;

        
        // FIX 2: The buyer ID is pulled directly from the user_id field in the JWT
        // buyer_id now comes from request body
        // const buyer_id = decoded.user_id; 
        
        if (!amount || !description || !paymentMethod) {
            return {
                statusCode: 400,
                headers: HEADERS,
                body: JSON.stringify({ error: "Missing required fields: amount, description, or paymentMethod." }),
            };
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return {
                statusCode: 400,
                headers: HEADERS,
                body: JSON.stringify({ error: "Invalid amount provided." }),
            };
        }
        
        const initialStatus = 'PENDING_SELLER_ACCEPTANCE'; 

        const insertQuery = `
            INSERT INTO escrows (buyer_id, seller_id, amount, description, payment_method, status, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING *;
        `;

        const values = [
            parseInt(buyer_id, 10), // buyer_id is now the corrected decoded.user_id
            DEFAULT_SELLER_ID, 
            parsedAmount, 
            description, 
            paymentMethod, 
            initialStatus
        ];

        const result = await query(insertQuery, values);
        const newEscrow = result.rows[0];

        // --- Success Response ---
        return {
            statusCode: 201, 
            headers: HEADERS,
            body: JSON.stringify({
                message: `Escrow proposal created successfully with system Seller ID ${DEFAULT_SELLER_ID}, awaiting acceptance.`,
                escrow: newEscrow,
            }),
        };
    } catch (err) {
        console.error("Fatal error in buyerCreateEscrow:", err);
        
        let customError = err.message || "An unknown error occurred during escrow creation.";
        let status = 500;
        
        if (err.code === '23503') { 
            status = 404;
            customError = `The system Seller ID (${DEFAULT_SELLER_ID}) or Buyer ID is invalid.`;
        } else if (err.code === '22P02') { 
             status = 400;
             customError = "Invalid input format for ID or amount.";
        }

        return {
            statusCode: status,
            headers: HEADERS,
            body: JSON.stringify({
                error: customError,
            }),
        };
    }
};