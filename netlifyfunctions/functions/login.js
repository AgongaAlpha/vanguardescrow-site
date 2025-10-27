// Install with: npm install pg bcryptjs jsonwebtoken
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- DATABASE HELPER (Reused from signup.js) ---
async function query(sql, params) {
    let client;
    try {
        // DATABASE_URL must be set in Netlify Environment Variables
        client = new Client({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false,
            },
        });
        await client.connect();
        const result = await client.query(sql, params);
        return result;
    } catch (e) {
        console.error("Database query failed:", e.stack);
        throw new Error('Database operation failed.');
    } finally {
        if (client) {
            await client.end();
        }
    }
}
// --- END DATABASE HELPER ---


exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const data = JSON.parse(event.body);
        const { email, password } = data;

        if (!email || !password) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Missing email or password." })
            };
        }

        // 1. Fetch user data (crucially, fetching the 'password_hash')
        const userQuery = `
            SELECT id, password_hash, role, name 
            FROM users 
            WHERE email = $1
        `;
        const result = await query(userQuery, [email]);
        
        const user = result.rows[0];

        // 2. Check if user exists
        if (!user) {
            // Use a generic error message for security (prevents user enumeration)
            return {
                statusCode: 401, 
                body: JSON.stringify({ message: "Invalid credentials." })
            };
        }

        // 3. Verify the password hash
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return {
                statusCode: 401, 
                body: JSON.stringify({ message: "Invalid credentials." })
            };
        }
        
        // 4. Generate the JSON Web Token (JWT)
        // JWT_SECRET must be set in Netlify Environment Variables
        const tokenPayload = { 
            user_id: user.id, 
            role: user.role 
        };
        
        const token = jwt.sign(
            tokenPayload, 
            process.env.JWT_SECRET, 
            { expiresIn: '1h' } // Token expires in 1 hour
        );

        // 5. Success! Return the token and basic user info
        return {
            statusCode: 200, 
            body: JSON.stringify({
                status: "success",
                message: "Login successful.",
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    role: user.role
                }
            }),
        };

    } catch (error) {
        // Log the full error to the console for Netlify debugging
        console.error("Login failed:", error.stack); 

        // Return a generic 500 error to the client
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Internal server error during login.",
                details: error.message 
            }),
        };
    }
};
