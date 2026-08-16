#!/usr/bin/env node
/**
 * LinkedIn OAuth 2.0 access-token helper.
 *
 * Uses the standard LinkedIn Authorization Code flow (no MCP, no local token
 * server). You need a LinkedIn Developer App with the "Share on LinkedIn"
 * product, which enables the w_member_social scope.
 *
 * Usage:
 *   1. Put LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET and
 *      LINKEDIN_REDIRECT_URI in a local .env (see .env.example).
 *   2. Run:   npm run auth
 *   3. Open the printed URL in a browser, log in, and approve.
 *   4. You will be redirected to your redirect URI with ?code=...
 *   5. Paste the full redirect URL back here.
 *   6. The script exchanges the code for an access token and prints it.
 *
 * Store the token as LINKEDIN_ACCESS_TOKEN (GitHub Actions Secret / .env).
 *
 * Honest limitations:
 *  - Member access tokens expire (~60 days). Re-run this when the API starts
 *    returning 401 Unauthorized.
 *  - The "Share on LinkedIn" product is restricted for some new apps; if your
 *    app cannot be approved, publishing will not work.
 */

const readline = require('readline');
const axios = require('axios');
require('dotenv').config();

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const SCOPE = 'w_member_social';

function fail(message) {
  console.error(`\n✗ ${message}`);
  console.error('Add the missing values to a local .env file (see .env.example) and try again.');
  process.exit(1);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

async function main() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId) fail('LINKEDIN_CLIENT_ID is missing.');
  if (!clientSecret) fail('LINKEDIN_CLIENT_SECRET is missing.');
  if (!redirectUri) fail('LINKEDIN_REDIRECT_URI is missing.');

  const authUrl =
    `${AUTHORIZE_URL}?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(SCOPE)}`;

  console.log('\n1. Open this URL in your browser and approve access:\n');
  console.log(authUrl);
  console.log('\n2. After authorizing, LinkedIn redirects to:');
  console.log(`   ${redirectUri}?code=...`);
  console.log('\n3. Paste the FULL redirect URL (including ?code=...) below.\n');

  const fullUrl = await ask('Paste the redirect URL: ');
  const codeMatch = fullUrl.match(/[?&]code=([^&]+)/);
  if (!codeMatch) {
    fail('No "code" parameter found in the URL you pasted.');
  }
  const code = codeMatch[1];

  console.log('\nExchanging code for an access token...');
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const resp = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
  });

  const { access_token, expires_in } = resp.data;
  if (!access_token) fail('No access_token in the response.');

  console.log('\n✓ Access token obtained.');
  if (expires_in) {
    const days = Math.round(expires_in / 86400);
    console.log(`  Expires in: ~${days} day(s) (LinkedIn member tokens are short-lived).`);
  }
  console.log('\nSet it as LINKEDIN_ACCESS_TOKEN in your GitHub Actions Secrets and/or .env.\n');
  console.log('LINKEDIN_ACCESS_TOKEN=' + access_token);
  console.log('\nKeep this value private — anyone with it can post to your LinkedIn account.');
}

main().catch((err) => {
  console.error(`\n✗ OAuth failed: ${err.response?.data || err.message}`);
  process.exit(1);
});
