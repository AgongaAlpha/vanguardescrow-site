// netlify/functions/adminConfirmDeposit.js
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { query } = require("./db"); // Assume shared pool function

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
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "Server configuration missing JWT_SECRET." }) };
    }

    // --- Authentication and Authorization ---
    try {
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

        // Critical: Check for admin role
        if (decoded.role !== "admin") {
            return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: "Forbidden: Admin privileges required" }) };
        }

        // --- Input Validation ---
        let bodyData;
        try {
            bodyData = JSON.parse(event.body || "{}");
        } catch {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Invalid JSON body" }) };
        }

        const { escrowId } = bodyData;

        if (!escrowId) {
            return {
                statusCode: 400,
                headers: HEADERS,
                body: JSON.stringify({ error: "escrowId is required" }),
            };
        }

        // --- Database Update (Atomic operation) ---
        // Only update if the current status is 'deposit_pending'
        const updateQuery = `
            UPDATE escrows
            SET 
                status = 'deposit_confirmed',
                deposit_confirmed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1 AND status = 'deposit_pending'
            RETURNING *;
        `;
        
        const result = await query(updateQuery, [escrowId]);
        const updatedEscrow = result.rows[0];

        // --- Response Handling ---
        if (!updatedEscrow) {
             // Check if the escrow exists at all, or if it was just in the wrong state
             const checkResult = await query("SELECT id, status FROM escrows WHERE id = $1", [escrowId]);
             
             if (checkResult.rows.length === 0) {
                return {
                    statusCode: 404,
                    headers: HEADERS,
                    body: JSON.stringify({ error: "Escrow not found." }),
                };
             } else {
                 return {
                    statusCode: 409, // Conflict
                    headers: HEADERS,
                    body: JSON.stringify({ 
                        error: `Deposit cannot be confirmed. Escrow #${escrowId} is currently in status: ${checkResult.rows[0].status}. Must be 'deposit_pending'.`
                    }),
                };
             }
        }

        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({ 
                message: "Deposit confirmed successfully by admin", 
                escrow: updatedEscrow 
            }),
        };
    } catch (err) {
        console.error("Fatal error in adminConfirmDeposit:", err);
        
        const status = err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' ? 401 : 500;
        
        return {
            statusCode: status,
            headers: HEADERS,
            body: JSON.stringify({ error: err.message || "Internal server error" }),
        };
    }
};
