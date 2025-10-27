const { Client } = require('pg');

// NOTE: In a serverless environment, it's generally best practice to establish
// a connection pool or create a new Client instance within the handler
// and close it to manage resources effectively.

exports.handler = async (event) => {
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Instantiate the client using the connection string.
  // We will connect and disconnect within the handler.
  const client = new Client({
    connectionString: process.env.NEON_DB_URL,
    ssl: { rejectUnauthorized: false } // Only needed if you run into connection issues locally
  });

  try {
    const { id, status } = JSON.parse(event.body);

    if (!id || !status) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields: id, status' }) };
    }

    await client.connect();

    // 1. Define the SQL UPDATE statement using parameterized queries ($1, $2, etc.)
    // We assume your PostgreSQL table is named 'escrows' and the primary key is 'id'.
    const sql = `
      UPDATE escrows
      SET status = $1, updated_at = NOW()
      WHERE id = $2;
    `;
    
    // 2. Define the values array to prevent SQL injection
    const values = [status, id]; 

    // 3. Execute the query
    const result = await client.query(sql, values);

    // PostgreSQL 'pg' client returns rowCount (number of affected rows),
    // which replaces MongoDB's 'matchedCount'.
    if (result.rowCount === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Escrow not found' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Escrow updated successfully', id, status }),
    };
  } catch (error) {
    console.error("Database Update Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  } finally {
    // IMPORTANT: Ensure the connection is closed after the operation
    if (client) {
      await client.end().catch(e => console.error("Error closing PG client:", e));
    }
  }
};
