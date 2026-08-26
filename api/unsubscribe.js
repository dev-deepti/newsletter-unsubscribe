const HUBSPOT_API_URL = 'https://api.hubapi.com';
const UNSUBSCRIBE_API_URL = `${HUBSPOT_API_URL}/communication-preferences/2026-03/statuses`;
const CONTACTS_API_URL = `${HUBSPOT_API_URL}/crm/v3/objects/contacts`;
const CONTACTS_SEARCH_API_URL = `${CONTACTS_API_URL}/search`;

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
 * Finds a HubSpot contact using the email address.
 */
async function findContact(email, headers) {
  console.log('Searching HubSpot contact:', email);

  const response = await fetch(CONTACTS_SEARCH_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'email',
              operator: 'EQ',
              value: email,
            },
          ],
        },
      ],
      properties: ['email'],
      limit: 1,
    }),
  });

  const result = await response.json();

  console.log('Contact search status:', response.status);
  console.log('Contact search result:', result);

  return {
    response,
    contact: result?.results?.[0] || null,
  };
}

/**
 * Deletes a HubSpot contact by contact ID.
 */
async function deleteContact(contactId, headers) {
  console.log('Deleting HubSpot contact:', contactId);

  const response = await fetch(`${CONTACTS_API_URL}/${contactId}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Contact deletion failed:', response.status, error);
  }

  return response;
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

    /* ========== Find the HubSpot contact ========== */
    const { response: searchResponse, contact } = await findContact(normalizedEmail, hubspotHeaders);

    // Contact search API failed
    if (!searchResponse.ok) {
      return res.status(searchResponse.status).json({
        success: false,
        status: 'CONTACT_SEARCH_FAILED',
        message: 'We could not verify your contact record.',
      });
    }

    // Search succeeded but no contact exists
    if (!contact) {
      console.log('No HubSpot contact found for:', normalizedEmail);

      return res.status(200).json({
        success: true,
        status: 'UNSUBSCRIBED',
        unsubscribed: true,
        contactDeleted: false,
        message: 'Email was unsubscribed, but no HubSpot contact was found.',
      });
    }

    /* ========== Delete the HubSpot contact ========== */
    const deleteResponse = await deleteContact(contact.id, hubspotHeaders);

    // Contact deletion failed
    if (!deleteResponse.ok) {
      return res.status(deleteResponse.status).json({
        success: false,
        status: 'UNSUBSCRIBED_DELETE_FAILED',
        unsubscribed: true,
        contactDeleted: false,
        message: 'Email has been unsubscribed from all email communications, but we could not remove the contact record.',
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
