const { Client } = require('pg');
const bcrypt = require('bcryptjs');

// Helper headers for JSON responses
const HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: HEADERS,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // --- FIX APPLIED HERE ---
    // Now using DATABASE_URL to match the Netlify environment variable key
    const client = new Client({
        connectionString: process.env.DATABASE_URL, 
        ssl: { rejectUnauthorized: false }
    });

    try {
        const { name, email, password, role } = JSON.parse(event.body);

        if (!name || !email || !password || !role) {
            return {
                statusCode: 400,
                headers: HEADERS,
                body: JSON.stringify({ error: 'Missing required fields: name, email, password, role' })
            };
        }

        await client.connect();

        // 1. Check if user already exists (NeonDB: findOne)
        const checkSql = `SELECT id FROM users WHERE email = $1;`;
        const existingUserResult = await client.query(checkSql, [email]);

        if (existingUserResult.rows.length > 0) {
            // User already exists
            return {
                statusCode: 409, // Conflict
                headers: HEADERS,
                body: JSON.stringify({ error: 'User already exists with this email.' }),
            };
        }

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Insert new user (NeonDB: insertOne)
        const insertSql = `
            INSERT INTO users (name, email, password_hash, role, balance, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING id;
        `;
        const insertValues = [name, email, hashedPassword, role, 0]; // Initial balance is 0

        const result = await client.query(insertSql, insertValues);

        // PostgreSQL uses RETURNING to give back the inserted row data, specifically the 'id'.
        const userId = result.rows[0].id;

        // SUCCESS: Returns clean JSON
        return {
            statusCode: 201,
            headers: HEADERS,
            body: JSON.stringify({
                status: 'success',
                message: 'Account created successfully',
                user_id: userId,
            }),
        };

    } catch (error) {
        console.error('Signup Handler Error:', error.message);
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({
                error: 'Internal server error.',
                details: error.message
            }),
        };
    } finally {
        // IMPORTANT: Ensure the connection is closed after the operation
        if (client) {
            await client.end().catch(e => console.error("Error closing PG client:", e));
        }
    }
};
