const { Client } = require('pg');
const jwt = require("jsonwebtoken");

// Helper headers for JSON responses
const HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
};

module.exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers: HEADERS,
            body: JSON.stringify({ error: "Method not allowed" })
        };
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Necessary for connecting to Neon/Postgres over SSL
    });

    try {
        // 1. Auth Check (Same as MongoDB version)
        const authHeader = event.headers.authorization || "";
        const token = authHeader.split(" ")[1];
        if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Missing token" }) };

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Invalid or expired token" }) };
        }

        // 2. Body Parsing and Validation
        const { escrowId } = JSON.parse(event.body || "{}");
        if (!escrowId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Missing escrowId" }) };

        // 3. Connect to DB
        await client.connect();

        // 4. Find Escrow and check authorization (PostgreSQL SELECT)
        // Check both existence and if the current user is the 'created_by' (buyer)
        const selectSql = `
            SELECT created_by, status
            FROM escrows
            WHERE id = $1;
        `;
        const selectResult = await client.query(selectSql, [escrowId]);

        if (selectResult.rowCount === 0) {
            return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: "Escrow not found" }) };
        }

        const escrow = selectResult.rows[0];

        // Ensure requester is the creator (buyer) of this escrow
        // We compare the string representation of the IDs
        if (String(escrow.created_by) !== String(decoded.userId)) {
            return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: "Not authorized to mark this escrow" }) };
        }

        // 5. Update status (PostgreSQL UPDATE)
        const updateSql = `
            UPDATE escrows
            SET
                status = 'deposit_pending',
                deposit_requested_at = NOW()
            WHERE id = $1
            RETURNING *; -- Return the updated row
        `;
        const updateResult = await client.query(updateSql, [escrowId]);

        const updatedEscrow = updateResult.rows[0];

        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({
                message: "Escrow marked as paid (deposit_pending)",
                escrow: updatedEscrow
            }),
        };
    } catch (err) {
        console.error('markPaid error:', err);
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({ error: "Internal server error", details: err.message })
        };
    } finally {
        // IMPORTANT: Ensure the connection is closed
        if (client) {
            await client.end().catch(e => console.error("Error closing PG client:", e));
        }
    }
};
