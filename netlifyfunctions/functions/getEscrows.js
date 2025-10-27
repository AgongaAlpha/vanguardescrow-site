// netlify/functions/getEscrows.js
require('dotenv').config();

const { Client } = require('pg');
const jwt = require("jsonwebtoken");

const NEON_DB_URL = process.env.NEON_DB_URL;
const JWT_SECRET = process.env.JWT_SECRET;

const HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    // 1. Check for environment variables
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
        ssl: { rejectUnauthorized: false } // Required for external Postgres connections
    });

    try {
        // 2. Check for Authorization header
        const authHeader = event.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Missing or malformed Authorization header" }) };
        }

        // 3. Extract token and verify
        const token = authHeader.split(" ")[1];
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Invalid or expired token", details: err.message }) };
        }

        const userId = decoded.userId;

        // 4. Connect to DB
        await client.connect();

        // 5. Fetch escrows where the user is EITHER the buyer OR the seller
        // NOTE: In the PostgreSQL schema, 'createdBy' (MongoDB) is replaced by
        // checking both 'buyer_id' and 'seller_id' to ensure comprehensive data access.
        const sql = `
            SELECT *
            FROM escrows
            WHERE buyer_id = $1 OR seller_id = $1
            ORDER BY created_at DESC;
        `;

        const result = await client.query(sql, [userId]);
        
        // 6. Response
        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify(result.rows),
        };

    } catch (error) {
        console.error("Get Escrows Handler Error:", error.message);
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({ 
                error: "Internal server error while fetching escrows.",
                details: error.message 
            }),
        };
    } finally {
        // IMPORTANT: Ensure the connection is closed
        if (client) {
            await client.end().catch(e => console.error("Error closing PG client:", e));
        }
    }
};
