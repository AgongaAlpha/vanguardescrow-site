// netlify/functions/escrow.js
require('dotenv').config();

const { Client } = require('pg');
const jwt = require("jsonwebtoken");

const NEON_DB_URL = process.env.NEON_DB_URL;
const JWT_SECRET = process.env.JWT_SECRET;

const HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    // MANDATORY: Handle CORS Preflight request (OPTIONS)
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers: HEADERS, body: 'CORS Preflight Success' };
    }

    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers: HEADERS,
            body: JSON.stringify({ error: "Method not allowed" }),
        };
    }

    if (!NEON_DB_URL || !JWT_SECRET) {
        console.error("Server misconfiguration: Database URL or JWT Secret not set.");
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({ error: "Server configuration missing required environment variables." }),
        };
    }

    const client = new Client({
        connectionString: NEON_DB_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        // 1. JWT Authentication
        const authHeader = event.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "No valid token provided" }) };
        }

        const token = authHeader.split(" ")[1];
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Invalid or expired token" }) };
        }

        const creatorId = decoded.userId; // The ID of the logged-in user who initiates the escrow

        // 2. Parse and Validate Request Body
        const { buyerEmail, sellerEmail, amount, description } = JSON.parse(event.body || "{}");

        if (!buyerEmail || !sellerEmail || !amount || !description) {
            return {
                statusCode: 400,
                headers: HEADERS,
                body: JSON.stringify({ error: "Missing required fields: buyerEmail, sellerEmail, amount, and description" }),
            };
        }

        if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
             return {
                statusCode: 400,
                headers: HEADERS,
                body: JSON.stringify({ error: "Amount must be a positive number." }),
            };
        }

        await client.connect();

        // 3. Find User IDs for Buyer and Seller based on Email
        // This assumes a 'users' table with 'id' and 'email' columns
        const findUsersQuery = `
            SELECT id, email, role 
            FROM users 
            WHERE email = $1 OR email = $2;
        `;
        const usersResult = await client.query(findUsersQuery, [buyerEmail, sellerEmail]);
        const users = usersResult.rows;

        if (users.length !== 2) {
             // Handle case where one or both users are not found
             const foundEmails = users.map(u => u.email);
             let missingUser = "";
             if (!foundEmails.includes(buyerEmail)) missingUser = "Buyer";
             else if (!foundEmails.includes(sellerEmail)) missingUser = "Seller";

             return {
                statusCode: 404,
                headers: HEADERS,
                body: JSON.stringify({ error: `${missingUser} user not found with the provided email.` }),
            };
        }

        const buyer = users.find(u => u.email === buyerEmail);
        const seller = users.find(u => u.email === sellerEmail);

        // 4. Insert Escrow Record into PostgreSQL
        const insertQuery = `
            INSERT INTO escrows (
                buyer_id, 
                seller_id, 
                amount, 
                description,
                status, 
                creator_id, 
                created_at
            ) VALUES (
                $1, $2, $3, $4, 'pending', $5, NOW()
            ) RETURNING *;
        `;
        
        const insertResult = await client.query(insertQuery, [
            buyer.id, 
            seller.id, 
            parseFloat(amount), 
            description,
            creatorId
        ]);

        const newEscrow = insertResult.rows[0];

        // 5. Return Success
        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({
                message: "Escrow created successfully.",
                escrow: newEscrow,
            }),
        };
    } catch (error) {
        console.error("Escrow Handler Error:", error.message);
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({
                error: "Internal server error during escrow creation.",
                details: error.message
            }),
        };
    } finally {
        // Ensure the connection is closed
        await client.end().catch(e => console.error("Error closing PG client:", e));
    }
};
