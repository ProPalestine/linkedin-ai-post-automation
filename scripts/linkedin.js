/**
 * LinkedIn publishing via the official UGC Posts API.
 *
 * Authentication uses a single OAuth 2.0 access token from the
 * LINKEDIN_ACCESS_TOKEN environment variable (GitHub Actions Secret in CI,
 * .env locally). Tokens are never read from any local tool directory —
 * generate a token once with `npm run auth` and store it as a secret.
 *
 * API notes (honest limitations):
 *  - POST /v2/ugcPosts requires the "Share on LinkedIn" product and the
 *    w_member_social scope. LinkedIn restricts access to this product for
 *    some new developer apps; if your app cannot be approved, the publish
 *    step will fail with a clear API error.
 *  - Member access tokens expire (~60 days) and must be regenerated.
 */

const axios = require('axios');

const API_BASE = 'https://api.linkedin.com';
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolve the LinkedIn person URN from the access token. */
async function getPersonId(accessToken) {
  const userResp = await axios.get(`${API_BASE}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
  const personId = userResp.data.sub;
  if (!personId) throw new Error('No person ID returned by LinkedIn /v2/userinfo');
  return personId;
}

/**
 * Publish a post to LinkedIn. Throws on final failure after retries.
 * @param {string} postContent  The post text
 * @param {string} accessToken  LINKEDIN_ACCESS_TOKEN
 * @returns {Promise<string>}   The post ID returned by LinkedIn
 */
async function publishToLinkedIn(postContent, accessToken, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const personId = await getPersonId(accessToken);

      const postData = {
        author: `urn:li:person:${personId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: postContent },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      };

      const postResp = await axios.post(`${API_BASE}/v2/ugcPosts`, postData, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        timeout: 30000,
      });

      return postResp.data.id;
    } catch (err) {
      const detail = err.response?.data || err.message;
      if (attempt < retries) {
        const wait = attempt * 5000;
        console.log(`LinkedIn attempt ${attempt}/${retries} failed: ${JSON.stringify(detail)}. Retrying in ${wait / 1000}s...`);
        await sleep(wait);
      } else {
        throw new Error(`LinkedIn API failed after ${retries} attempts: ${JSON.stringify(detail)}`);
      }
    }
  }
}

module.exports = { publishToLinkedIn, getPersonId };
