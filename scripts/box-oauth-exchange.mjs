#!/usr/bin/env node
/**
 * One-time helper: exchange a Box OAuth authorization `code` for an access + refresh token.
 *
 * Box 3-legged OAuth, step 2. First do step 1 in a browser:
 *   https://account.box.com/api/oauth2/authorize?client_id=<ID>&response_type=code&redirect_uri=<REDIRECT_URI>
 * Box redirects to <REDIRECT_URI>?code=XXXX — grab that code, then run:
 *
 *   BOX_CLIENT_ID=... BOX_CLIENT_SECRET=... node scripts/box-oauth-exchange.mjs <code> [redirect_uri]
 *
 * Prints the refresh_token to store in the MJ Credential (the value the storage driver reads as
 * `refreshToken`). The code is single-use and expires in ~30s, so run promptly after authorizing.
 */
const clientId = process.env.BOX_CLIENT_ID;
const clientSecret = process.env.BOX_CLIENT_SECRET;
const code = process.argv[2];
const redirectUri = process.argv[3]; // optional; Box requires it only if your app set one

if (!clientId || !clientSecret) {
    console.error('Set BOX_CLIENT_ID and BOX_CLIENT_SECRET env vars.');
    process.exit(1);
}
if (!code) {
    console.error('Pass the authorization code as the first argument.');
    process.exit(1);
}

const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
});
if (redirectUri) params.set('redirect_uri', redirectUri);

const res = await fetch('https://api.box.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
});

const data = await res.json();
if (!res.ok) {
    console.error(`HTTP ${res.status}:`, JSON.stringify(data, null, 2));
    console.error('\nCommon causes: code expired (>30s), redirect_uri mismatch, or wrong client secret.');
    process.exit(1);
}

console.log('\n✅ Success. Store these in the MJ Credential for Box:\n');
console.log('  refreshToken =', data.refresh_token);
console.log('\n(access token is short-lived and auto-refreshed by the driver; you do NOT store it)');
console.log('  access_token (info only) =', (data.access_token || '').slice(0, 12) + '…');
console.log('  expires_in =', data.expires_in, 'seconds');
