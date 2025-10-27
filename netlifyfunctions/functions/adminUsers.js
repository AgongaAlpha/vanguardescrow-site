// netlify/functions/adminUsers.js
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
            // Token is invalid or expired
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Invalid or expired token" }) };
        }

        // Critical: Check for admin role
        if (decoded.role !== "admin") {
            return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: "Forbidden: Admin privileges required" }) };
        }

        // 3. Fetch users from PostgreSQL
        // We explicitly select safe fields and exclude 'password_hash' and other sensitive columns.
        const selectQuery = `
            SELECT id, email, role, created_at, updated_at
            FROM users 
            ORDER BY created_at DESC;
        `;
        
        const result = await query(selectQuery);
        const users = result.rows;

        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify(users),
        };
    } catch (err) {
        console.error("Fatal error in adminUsers:", err);
        
        const status = err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' ? 401 : 500;
        
        return { 
            statusCode: status, 
            headers: HEADERS,
            body: JSON.stringify({ error: err.message || "Internal server error" }) 
        };
    }
};
