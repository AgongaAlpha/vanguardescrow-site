// netlify/functions/markDelivered.js
// Load local .env when running `netlify dev`
require('dotenv').config();

const { Client } = require('pg');
const jwt = require("jsonwebtoken");

const NEON_DB_URL = process.env.NEON_DB_URL; // Use NEON_DB_URL explicitly
const JWT_SECRET = process.env.JWT_SECRET;

// Helper headers for JSON responses
const HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers: HEADERS,
            body: JSON.stringify({ error: "Method not allowed" }),
        };
    }

    const client = new Client({
        connectionString: NEON_DB_URL,
        ssl: { rejectUnauthorized: false } // Necessary for connecting to Neon/Postgres over SSL
    });

    try {
        // 1) Environment Check (Minimal check required for production)
        if (!NEON_DB_URL || !JWT_SECRET) {
            console.error("DEBUG: Missing NEON_DB_URL or JWT_SECRET");
            return {
                statusCode: 500,
                headers: HEADERS,
                body: JSON.stringify({
                    error: "Server misconfiguration: Database URL or JWT Secret not set.",
                }),
            };
        }

        // 2) Verify token (Seller-only authorization)
        const authHeader = event.headers.authorization || "";
        const token = authHeader.split(" ")[1];
        if (!token) {
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "No token provided" }) };
        }

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Invalid or expired token", details: err.message }) };
        }

        // Check if the authenticated user has the 'seller' role
        if (decoded.role !== "seller") {
            return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: "Only sellers can mark delivered" }) };
        }

        // 3) Parse body safely
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Invalid JSON body" }) };
        }

        const { escrowId } = body;
        if (!escrowId) {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Missing escrowId" }) };
        }

        // 4) Connect to DB
        await client.connect();

        // 5) Find escrow, validate status, and check seller authorization in a single query (or two steps)

        // Step A: Fetch current escrow details
        const selectSql = `
            SELECT seller_id, status
            FROM escrows
            WHERE id = $1;
        `;
        const selectResult = await client.query(selectSql, [escrowId]);

        if (selectResult.rowCount === 0) {
            return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: "Escrow not found" }) };
        }

        const escrow = selectResult.rows[0];

        // Check if the authenticated user is the assigned seller for this escrow
        if (String(escrow.seller_id) !== String(decoded.userId)) {
            return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: "Not authorized. You are not the seller for this escrow." }) };
        }

        // Check if the escrow is in the correct status
        if (escrow.status !== "funded") {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Escrow must be 'funded' before it can be marked 'delivered'" }) };
        }

        // 6) Update to 'delivered' status (PostgreSQL UPDATE)
        const updateSql = `
            UPDATE escrows
            SET
                status = 'delivered',
                delivered_at = NOW()
            WHERE id = $1
            RETURNING *; -- Return the updated row data
        `;
        const updateResult = await client.query(updateSql, [escrowId]);

        const updatedEscrow = updateResult.rows[0];

        // 7) Response
        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({
                message: "Escrow marked as delivered. Awaiting buyer confirmation (release_requested).",
                escrow: updatedEscrow
            }),
        };
    } catch (err) {
        console.error("Error in markDelivered:", err.message);
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({ error: "Internal server error", details: err.message }),
        };
    } finally {
        // IMPORTANT: Ensure the connection is closed
        if (client) {
            await client.end().catch(e => console.error("Error closing PG client:", e));
        }
    }
};
