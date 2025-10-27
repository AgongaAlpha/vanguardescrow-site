const { Pool } = require('pg');

// NOTE: Netlify functions already manage environment variables;
// requiring dotenv here is usually unnecessary and can sometimes cause conflicts.
// If you use 'dotenv' locally, make sure it is conditional or commented out in production.

// --- CRITICAL CONNECTION CHECK ---
// The connection string MUST come from the Netlify environment variable NEON_DB_URL.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    // This is the clean error message you should see if Netlify fails to load the variable.
    // It prevents the 'ENOTFOUND base' error.
    console.error("CRITICAL ERROR: DATABASE_URL is MISSING.");
    throw new Error(
        "Database connection string (DATABASE_URL) is not set in the Netlify environment variables. " +
        "Please check your Netlify site settings > Build & deploy > Environment."
    );
}

// Global variable to hold the connection pool.
let pool;

/**
 * Initializes and returns the PostgreSQL connection pool.
 * Uses a singleton pattern to ensure only one pool is created.
 * @returns {Pool} The PostgreSQL connection pool instance.
 */
function getPool() {
    if (!pool) {
        console.log("Initializing new PostgreSQL Pool.");
        pool = new Pool({
            connectionString: connectionString,
            // You may need to add SSL options for Neon/Postgres providers
            // ssl: {
            //     rejectUnauthorized: false, // Use if needed, but often not required for Neon
            // },
        });

        // Optional: Add an error handler to catch connection issues early
        pool.on('error', (err, client) => {
            console.error('Unexpected error on idle client', err);
            // process.exit(-1); // Don't exit process in serverless functions
        });
    }
    return pool;
}

// Export the function to get the pool and a helper for querying
module.exports = {
    getPool,
    query: (text, params) => getPool().query(text, params),
};
