// netlify/functions/confirmDeposit.js
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
        return {
            statusCode: 405,
            headers: HEADERS,
            body: JSON.stringify({ message: "Method not allowed" }),
        };
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
        const authHeader = event.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "No valid token provided" }) };
        }

        const token = authHeader.split(" ")[1];
        const decodedUser = jwt.verify(token, JWT_SECRET);
        // The deposit confirmation must be done by the Buyer
        const buyerId = decodedUser.userId; 

        // 3. Parse Request Body
        const body = JSON.parse(event.body || "{}");
        const { escrowId } = body; 

        if (!escrowId) {
            return {
                statusCode: 400,
                headers: HEADERS,
                body: JSON.stringify({ message: "Missing escrowId" }),
            };
        }

        // 4. Update the escrow status in PostgreSQL
        // The query ensures three conditions are met for success:
        // a) Escrow ID matches ($1)
        // b) The logged-in user is the actual buyer ($2)
        // c) The escrow status is currently 'pending' (for state integrity)
        const updateQuery = `
            UPDATE escrows 
            SET 
                status = 'confirmed', 
                deposit_confirmed_at = NOW() 
            WHERE 
                id = $1 AND 
                buyer_id = $2 AND
                status = 'pending' 
            RETURNING id, status, amount, buyer_id, seller_id;
        `;

        const result = await query(updateQuery, [escrowId, buyerId]);

        if (result.rowCount === 0) {
            // This happens if the escrow is not found, or is not pending, or the user is not the buyer.
            return {
                statusCode: 400, 
                headers: HEADERS,
                body: JSON.stringify({ 
                    message: "Failed to confirm deposit. Escrow may not exist, may already be confirmed, or you may not be the authorized buyer."
                }),
            };
        }

        const updatedEscrow = result.rows[0];

        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({ 
                message: "Deposit confirmed successfully. Funds are now held in escrow.",
                escrow: updatedEscrow
            }),
        };
    } catch (error) {
        console.error("Error confirming deposit:", error.message);
        
        // Handle JWT verification errors specifically
        const status = error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' ? 401 : 500;

        return {
            statusCode: status,
            headers: HEADERS,
            body: JSON.stringify({ 
                message: status === 401 ? "Unauthorized: Invalid token" : "Internal Server Error", 
                error: error.message 
            }),
        };
    }
};
