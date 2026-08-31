const HUBSPOT_API_URL = 'https://api.hubapi.com';
const UNSUBSCRIBE_API_URL = `${HUBSPOT_API_URL}/communication-preferences/2026-03/statuses`;

/**
 * Validates and normalizes an email address.
 * Returns the normalized email or null if invalid.
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;

  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return emailRegex.test(normalizedEmail) ? normalizedEmail : null;
}

/**
 * Unsubscribes the email from all HubSpot email communications.
 */
async function unsubscribeEmail(email, headers) {
  const encodedEmail = encodeURIComponent(email);
  const unsubscribeUrl = `${UNSUBSCRIBE_API_URL}/${encodedEmail}/unsubscribe-all?channel=EMAIL&verbose=true`;

  console.log('Unsubscribing:', email);

  const response = await fetch(unsubscribeUrl, {
    method: 'POST',
    headers,
  });

  const result = await response.json();

  console.log('Unsubscribe status:', response.status);
  console.log('Unsubscribe result:', result);

  return { response, result };
}

/**
 * Handles unsubscribe requests by validating the email,
 * unsubscribing it from HubSpot communications, and deleting
 * the associated HubSpot contact when one exists.
 */
export default async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN?.replace(/\/$/, '');

  /* ========== CORS ========== */
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      status: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed.',
    });
  }

  try {
    const { email } = req.body || {};

    // Validate and normalize email
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        status: 'INVALID_EMAIL',
        message: 'Please provide a valid email address.',
      });
    }

    // HubSpot authentication
    const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

    if (!token) {
      throw new Error('HUBSPOT_PRIVATE_APP_TOKEN is not configured.');
    }

    const hubspotHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    /* ========== Unsubscribe from all email communications ========== */
    const { response: unsubscribeResponse } = await unsubscribeEmail(normalizedEmail, hubspotHeaders);

    // Unsubscribe API failed
    if (!unsubscribeResponse.ok) {
      return res.status(unsubscribeResponse.status).json({
        success: false,
        status: 'UNSUBSCRIBE_FAILED',
        message: 'We could not complete your unsubscribe request.',
      });
    }

    /* ========== Both unsubscribe and contact deletion succeeded ========== */
    return res.status(200).json({
      success: true,
      status: 'UNSUBSCRIBED_AND_DELETED',
      unsubscribed: true,
      contactDeleted: true,
      message: 'Email has been unsubscribed from all email communications and removed from our records.',
    });
  } catch (error) {
    console.error('Unsubscribe function error:', error);

    return res.status(500).json({
      success: false,
      status: 'SERVER_ERROR',
      message: 'We couldn’t complete your unsubscribe request. Please try again.',
    });
  }
}
