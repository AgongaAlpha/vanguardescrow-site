// netlify/functions/adminCreateEscrow.js
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

        const { buyer_id, seller_id, amount, description, status } = bodyData;

        if (!buyer_id || !seller_id || !amount || !description) {
            return {
                statusCode: 400,
                headers: HEADERS,
                body: JSON.stringify({ error: "buyer_id, seller_id, amount, and description are required" }),
            };
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Amount must be a positive number." }) };
        }
        
        const initialStatus = status || "deposit_pending"; // Default status

        // --- Database Insertion ---
        const insertQuery = `
            INSERT INTO escrows (buyer_id, seller_id, amount, description, status)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        
        // Ensure buyer_id and seller_id are parsed as integers before passing to query
        const values = [
            parseInt(buyer_id, 10), 
            parseInt(seller_id, 10), 
            parsedAmount, 
            description, 
            initialStatus
        ];

        const result = await query(insertQuery, values);
        const newEscrow = result.rows[0];

        // --- Success Response ---
        return {
            statusCode: 201, // 201 Created is the standard status for successful POST requests
            headers: HEADERS,
            body: JSON.stringify({
                message: "Escrow created successfully by admin",
                escrow: newEscrow,
            }),
        };
    } catch (err) {
        console.error("Fatal error in adminCreateEscrow:", err);
        
        // Check for specific PostgreSQL integrity errors (e.g., user IDs not found)
        let customError = err.message || "Unknown error";
        let status = 500;
        
        if (err.code === '23503') { // Foreign Key Violation (buyer_id or seller_id not found)
            status = 404;
            customError = "One of the provided user IDs (buyer or seller) does not exist.";
        } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            status = 401;
        }

        return {
            statusCode: status,
            headers: HEADERS,
            body: JSON.stringify({ error: customError }),
        };
    }
};
