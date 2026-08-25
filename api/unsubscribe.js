export default async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN?.replace(/\/$/, '');

  // -----------------------------
  // CORS
  // -----------------------------

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // -----------------------------
  // Only POST
  // -----------------------------

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed.',
    });
  }

  try {
    const { email } = req.body || {};

    // -----------------------------
    // Validate email
    // -----------------------------

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

    if (!token) {
      throw new Error('HUBSPOT_PRIVATE_APP_TOKEN is not configured.');
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // =========================================================
    // STEP 1: UNSUBSCRIBE FROM ALL EMAIL COMMUNICATIONS
    // =========================================================

    const encodedEmail = encodeURIComponent(normalizedEmail);

    const unsubscribeUrl =
      `https://api.hubapi.com/communication-preferences/2026-03/statuses/` +
      `${encodedEmail}/unsubscribe-all?channel=EMAIL&verbose=true`;

    console.log('Unsubscribing:', normalizedEmail);

    const unsubscribeResponse = await fetch(
      unsubscribeUrl,
      {
        method: 'POST',
        headers,
      }
    );

    const unsubscribeResult = await unsubscribeResponse.json();

    console.log('Unsubscribe status:', unsubscribeResponse.status);
    console.log('Unsubscribe result:', unsubscribeResult);

    if (!unsubscribeResponse.ok) {
      return res.status(unsubscribeResponse.status).json({
        success: false,
        message:
          unsubscribeResult?.message ||
          unsubscribeResult?.error ||
          'Unable to unsubscribe this email.',
      });
    }

    // =========================================================
    // STEP 2: FIND CONTACT BY EMAIL
    // =========================================================

    console.log('Searching HubSpot contact:', normalizedEmail);

    const searchResponse = await fetch(
      'https://api.hubapi.com/crm/v3/objects/contacts/search',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'email',
                  operator: 'EQ',
                  value: normalizedEmail,
                },
              ],
            },
          ],
          properties: ['email'],
          limit: 1,
        }),
      }
    );

    const searchResult = await searchResponse.json();

    console.log('Contact search status:', searchResponse.status);
    console.log('Contact search result:', searchResult);

    if (!searchResponse.ok) {
      return res.status(searchResponse.status).json({
        success: false,
        message: searchResult?.message || 'Unable to find the HubSpot contact.',
      });
    }

    // =========================================================
    // STEP 3: CHECK WHETHER CONTACT EXISTS
    // =========================================================

    const contact = searchResult?.results?.[0];

    if (!contact) {
      console.log('No HubSpot contact found for:', normalizedEmail);

      return res.status(200).json({
        success: true,
        unsubscribed: true,
        contactDeleted: false,
        message: 'Email was unsubscribed, but no HubSpot contact was found.',
      });
    }

    const contactId = contact.id;

    console.log('HubSpot contact found:', contactId);

    // =========================================================
    // STEP 4: DELETE / ARCHIVE CONTACT
    // =========================================================

    const deleteUrl = `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`;

    console.log('Deleting HubSpot contact:', contactId);

    const deleteResponse = await fetch(
      deleteUrl,
      {
        method: 'DELETE',
        headers,
      }
    );

    if (!deleteResponse.ok) {
      const deleteText =
        await deleteResponse.text();

      console.error('Contact deletion failed:', deleteResponse.status, deleteText);

      return res.status(deleteResponse.status).json({
        success: false,
        unsubscribed: true,
        contactDeleted: false,
        message:
          'Email was unsubscribed, but the HubSpot contact could not be deleted.',
      });
    }

    console.log('HubSpot contact deleted:', contactId);

    // =========================================================
    // STEP 5: FINAL RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,
      unsubscribed: true,
      contactDeleted: true,
      message:
        'Email has been unsubscribed and the HubSpot contact has been deleted.',
    });

  } catch (error) {
    console.error(
      'Unsubscribe function error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        'Unable to complete the unsubscribe request.',
    });
  }
}
