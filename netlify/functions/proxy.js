
// netlify/functions/proxy.js - Simple proxy to Render API
exports.handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://vanguardescrow.online',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: ''
    };
  }

  try {
    // Extract the API path from the request
    const path = event.path.replace('/.netlify/functions/proxy', '');
    const renderUrl = `https://vanguardescrow-api-4.onrender.com${path}`;
    
    console.log('Proxying to:', renderUrl);
    
    // Forward the request to Render
    const response = await fetch(renderUrl, {
      method: event.httpMethod,
      headers: {
        'Content-Type': 'application/json',
        ...(event.headers.authorization && { Authorization: event.headers.authorization })
      },
      body: event.body
    });

    const data = await response.text();
    
    // Return the response with CORS headers
    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': 'https://vanguardescrow.online',
        'Content-Type': 'application/json'
      },
      body: data
    };
    
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': 'https://vanguardescrow.online'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
