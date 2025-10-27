require('dotenv').config();

const { Client } = require('pg');
const jwt = require('jsonwebtoken');

// NOTE: Ensure your environment variable is set to NEON_DB_URL for PostgreSQL
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

// Helper headers for JSON responses
const HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
};

module.exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: HEADERS,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const client = new Client({
        connectionString: NEON_DB_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        // 1) Auth: admin only
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'No token' }) };

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Invalid or expired token' }) };
        }

        // IMPORTANT: Authorization check
        if (decoded.role !== 'admin') {
            return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Only admin can release funds' }) };
        }

        // 2) Parse body
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        }
        const { escrowId, payoutNote } = body;
        if (!escrowId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing escrowId' }) };

        // 3) DB connect
        if (!NEON_DB_URL) {
            return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Server misconfiguration: NEON_DB_URL not set' }) };
        }
        await client.connect();

        // 4) Validate escrow and current state (PostgreSQL SELECT)
        // We assume escrowId maps to the 'id' column in the 'escrows' table
        const selectSql = `
            SELECT id, status, amount, seller_id
            FROM escrows
            WHERE id = $1;
        `;
        const selectResult = await client.query(selectSql, [escrowId]);

        if (selectResult.rowCount === 0) {
            return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Escrow not found' }) };
        }

        const escrow = selectResult.rows[0];

        // Require release_requested or funded status
        if (escrow.status !== 'release_requested' && escrow.status !== 'funded') {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Escrow is not ready for release' }) };
        }

        // === TRANSACTION LOGIC START (For a full system) ===
        // NOTE: A complete financial system would require a SQL TRANSACTION block here
        // to atomically perform two steps:
        // 1. UPDATE users SET balance = balance + $1 WHERE id = $2; (transfer funds)
        // 2. UPDATE escrows SET status = 'completed', ... (record status)
        // For direct conversion, we only perform the status update.
        // ===================================================

        // 5) Record admin action and mark completed (PostgreSQL UPDATE)
        const updateSql = `
            UPDATE escrows
            SET
                status = 'completed',
                released_at = NOW(),
                released_by = $1, -- Admin User ID from JWT
                release_note = $2
            WHERE id = $3
            RETURNING *; -- Get the updated row data
        `;
        const updateValues = [decoded.userId, payoutNote || null, escrowId];
        const updateResult = await client.query(updateSql, updateValues);

        // 6) Response
        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({
                message: 'Funds released (escrow completed)',
                // Return the updated escrow object
                escrow: updateResult.rows[0]
            })
        };
    } catch (err) {
        console.error('releaseFunds error:', err);
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({ error: 'Internal server error', details: err.message })
        };
    } finally {
        // IMPORTANT: Ensure the connection is closed
        if (client) {
            await client.end().catch(e => console.error("Error closing PG client:", e));
        }
    }
};
