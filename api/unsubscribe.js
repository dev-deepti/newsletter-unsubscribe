export default async function handler(req, res) {
  // --------------------------------
  // CORS
  // --------------------------------

  const allowedOrigin = process.env.ALLOWED_ORIGIN;

  res.setHeader(
    'Access-Control-Allow-Origin',
    allowedOrigin
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  // Handle browser preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // --------------------------------
  // Only allow POST
  // --------------------------------

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed.',
    });
  }

  try {
    // --------------------------------
    // Validate request
    // --------------------------------

    const { email } = req.body || {};

    console.log('Received email:', email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    // --------------------------------
    // HubSpot API
    // --------------------------------

    const encodedEmail = encodeURIComponent(normalizedEmail);

    const hubspotUrl =
      `https://api.hubapi.com/communication-preferences/2026-03/statuses/` +
      `${encodedEmail}/unsubscribe-all?channel=EMAIL&verbose=true`;

    console.log('Calling HubSpot...');

    const hubspotResponse = await fetch(hubspotUrl, {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${process.env.HUBSPOT_PRIVATE_APP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    const hubspotResult = await hubspotResponse.json();

    console.log(
      'HubSpot status:',
      hubspotResponse.status
    );

    console.log(
      'HubSpot response:',
      hubspotResult
    );

    // --------------------------------
    // HubSpot error
    // --------------------------------

    if (!hubspotResponse.ok) {
      return res.status(hubspotResponse.status).json({
        success: false,
        message:
          hubspotResult?.message ||
          hubspotResult?.error ||
          'HubSpot unsubscribe request failed.',
      });
    }

    // --------------------------------
    // Success
    // --------------------------------

    return res.status(200).json({
      success: true,
      message: 'Email successfully unsubscribed.',
      data: hubspotResult,
    });

  } catch (error) {
    console.error('Function error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to process unsubscribe request.',
    });
  }
}
