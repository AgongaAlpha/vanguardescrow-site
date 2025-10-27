// netlify/functions/adminEscrowDetails.js
require("dotenv").config();
const jwt = require("jsonwebtoken");
// IMPORTANT: We use the shared pool query function from db.js
const { query } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;
const HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    // 1. Handle CORS Preflight
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers: HEADERS, body: 'CORS Preflight Success' };
    }

    if (event.httpMethod !== "GET") {
        return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    if (!JWT_SECRET) {
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "Server configuration missing JWT_SECRET." }) };
    }

    try {
        // 2. JWT Authentication and Admin Authorization
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

        if (decoded.role !== "admin") {
            return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: "Forbidden: Admin privileges required" }) };
        }

        // 3. Extract Escrow ID from path parameters (e.g., /adminEscrowDetails/123)
        // If your endpoint is configured as /adminEscrowDetails?escrowId=123, use event.queryStringParameters.escrowId instead.
        const escrowId = event.queryStringParameters?.escrowId || event.pathParameters?.id; 
        
        if (!escrowId) {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Missing escrowId" }) };
        }

        // 4. Fetch the specific escrow and joined user details
        const selectQuery = `
            SELECT 
                e.*, 
                json_build_object('id', b.id, 'email', b.email, 'role', b.role) AS buyer_details,
                json_build_object('id', s.id, 'email', s.email, 'role', s.role) AS seller_details
            FROM escrows e
            LEFT JOIN users b ON e.buyer_id = b.id
            LEFT JOIN users s ON e.seller_id = s.id
            WHERE e.id = $1;
        `;
        
        const result = await query(selectQuery, [escrowId]);
        const escrow = result.rows[0];

        if (!escrow) {
            return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: "Escrow not found" }) };
        }

        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify(escrow),
        };
    } catch (err) {
        console.error("Fatal error in adminEscrowDetails:", err);
        
        const status = err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' ? 401 : 500;
        
        return { 
            statusCode: status, 
            headers: HEADERS,
            body: JSON.stringify({ error: err.message || "Internal server error" }) 
        };
    }
};
