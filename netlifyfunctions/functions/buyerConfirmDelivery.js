// netlify/functions/buyerConfirmDelivery.js
require("dotenv").config();
const jwt = require("jsonwebtoken");
// IMPORTANT: We use the shared pool query function from db.js
const { query } = require("./db"); 

const JWT_SECRET = process.env.JWT_SECRET;
const HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    // 1. Handle CORS Preflight
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers: HEADERS, body: 'CORS Preflight Success' };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    if (!JWT_SECRET) {
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({ error: "Server configuration missing JWT_SECRET." }),
        };
    }

    try {
        // 2. JWT Authentication and Authorization
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Missing or invalid Authorization header" }) };
        }

        const token = authHeader.split(" ")[1];
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (e) {
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Invalid or expired token" }) };
        }
        
        // Ensure the authenticated user is the buyer for this action
        const buyerId = decoded.userId;

        // 3. Parse Request Body
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Invalid JSON body" }) };
        }

        const { escrowId } = body;
        if (!escrowId) {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Missing escrowId" }) };
        }

        // 4. Update the escrow status in PostgreSQL
        // This single query ensures:
        // a) The escrow exists (id = $1)
        // b) The user performing the action is the buyer (buyer_id = $2)
        // c) The current status is 'delivered' (state integrity)
        const updateQuery = `
            UPDATE escrows 
            SET 
                status = 'release_requested', 
                buyer_confirmed_at = NOW() 
            WHERE 
                id = $1 AND 
                buyer_id = $2 AND
                status = 'delivered'
            RETURNING id, status, amount, buyer_id, seller_id;
        `;

        const result = await query(updateQuery, [escrowId, buyerId]);

        if (result.rowCount === 0) {
            // This happens if the escrow is not found, or not in 'delivered' state,
            // or the authenticated user is not the buyer.
            return {
                statusCode: 400, 
                headers: HEADERS,
                body: JSON.stringify({ 
                    error: "Could not confirm delivery. Escrow may not exist, is not in 'delivered' state, or you are not the buyer."
                }),
            };
        }

        const updatedEscrow = result.rows[0];

        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({ 
                message: "Delivery confirmed. Funds release requested.", 
                escrow: updatedEscrow 
            }),
        };
    } catch (err) {
        console.error("buyerConfirmDelivery fatal error:", err.message);

        // Handle JWT verification errors specifically
        const status = err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' ? 401 : 500;

        return { 
            statusCode: status, 
            headers: HEADERS,
            body: JSON.stringify({ 
                error: status === 401 ? "Unauthorized: Invalid token" : "Internal server error",
                details: err.message
            }) 
        };
    }
};
