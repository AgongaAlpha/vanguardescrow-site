// netlify/functions/proxy.js - Node.js version
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  console.log('Proxy function called:', event.path);
  
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': 'https://vanguardescrow.online',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };
  
  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  try {
    // Extract API path
    const apiPath = event.path.replace('/.netlify/functions/proxy', '');
    const targetUrl = `https://vanguardescrow-api-4.onrender.com${apiPath}`;
    
    console.log('Forwarding to:', targetUrl);
    
    // Prepare headers for the request to Render
    const requestHeaders = {
      'Content-Type': 'application/json'
    };
    if (event.headers.authorization) {
      requestHeaders['Authorization'] = event.headers.authorization;
    }
    
    // Forward request
    const response = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: requestHeaders,
      body: event.body
    });
    
    const data = await response.text();
    
    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: data
    };
    
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Proxy failed', 
        message: error.message 
      })
    };
  }
};
