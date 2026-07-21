#!/usr/bin/env node
/**
 * Manual test for the Secure Messaging promote endpoint (PRD §10.3).
 *
 * Signs a promote request with the shared HMAC secret exactly as the server verifies it
 * (v0:${timestamp}:${rawBody}), POSTs it, and prints the result. This is the stand-in for what
 * Izzy / the Outlook add-in backend will do.
 *
 * Usage:
 *   SECURE_MESSAGING_PROMOTE_SECRET=<secret> node scripts/test-promote.mjs [baseUrl]
 *
 * Reads the secret from the env var (same one MJAPI uses). baseUrl defaults to the local MJAPI.
 */
import { createHmac } from 'node:crypto';

const SECRET = process.env.SECURE_MESSAGING_PROMOTE_SECRET;
if (!SECRET) {
    console.error('Set SECURE_MESSAGING_PROMOTE_SECRET (the same value MJAPI uses).');
    process.exit(1);
}

const baseUrl = process.argv[2] || 'http://localhost:4101';
const url = `${baseUrl}/secure-messaging/api/v1/promote`;

// A realistic insecure (Email) thread being promoted to secure. Oldest-first.
const body = {
    contactEmail: 'promote-test@example.com',
    contactName: 'Promote Test',
    sourceChannel: 'Email',
    // Attribute the run to a real staff member if their email is an MJ user; else falls back.
    initiatedByEmail: process.env.PROMOTE_AS_EMAIL || undefined,
    messages: [
        {
            direction: 'Inbound',
            sender: 'promote-test@example.com',
            recipient: 'support@org.example',
            content: 'Hi — I need to update my SSN on file for my membership renewal.',
            receivedAt: '2026-06-20T14:02:00.000Z',
        },
        {
            direction: 'Outbound',
            sender: 'support@org.example',
            recipient: 'promote-test@example.com',
            content: 'Happy to help. That is sensitive, so let us switch to a secure channel.',
            receivedAt: '2026-06-20T14:05:00.000Z',
        },
    ],
};

const rawBody = JSON.stringify(body);
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = 'v0=' + createHmac('sha256', SECRET).update(`v0:${timestamp}:${rawBody}`).digest('hex');

console.log(`POST ${url}`);
console.log(`  x-sm-request-timestamp: ${timestamp}`);
console.log(`  x-sm-signature: ${signature.slice(0, 18)}…`);
console.log(`  body: ${rawBody}\n`);

const res = await fetch(url, {
    method: 'POST',
    headers: {
        'content-type': 'application/json',
        'x-sm-request-timestamp': timestamp,
        'x-sm-signature': signature,
    },
    body: rawBody,
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);

// Convenience: surface the portal URL to click.
try {
    const json = JSON.parse(text);
    if (json.magicLinkToken) {
        console.log(`\nThreadID:     ${json.threadId}`);
        console.log(`ImportedCount: ${json.importedCount}`);
        console.log(`Magic link:   <portal-url>?ml=${json.magicLinkToken}`);
    }
} catch {
    /* non-JSON error body already printed */
}
