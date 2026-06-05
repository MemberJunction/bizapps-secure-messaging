import { RegisterClass } from '@memberjunction/global';
import { sign as jwtSign } from 'jsonwebtoken';

/**
 * Result of creating an e-signature envelope with a provider.
 */
export interface CreateEnvelopeResult {
    success: boolean;
    /** Provider-specific envelope identifier (e.g. a DocuSign envelopeId). */
    externalEnvelopeId?: string;
    /** A URL the signer can be directed to, if the provider supplies one. */
    signingUrl?: string;
    errorMessage?: string;
}

/**
 * Status of a signature envelope as reported by the provider.
 */
export interface EnvelopeStatusResult {
    /** Normalized status, mapped onto the SignatureRequest lifecycle. */
    status: 'Draft' | 'Sent' | 'Signed' | 'Declined' | 'Cancelled' | 'Unknown';
    errorMessage?: string;
}

export interface CreateEnvelopeParams {
    /** The SignatureRequest record ID this envelope is for. */
    signatureRequestId: string;
    /** Title/subject of the document being sent for signature. */
    title: string;
    /** Email of the signer (the external contact). */
    signerEmail: string;
    /** Display name of the signer. */
    signerName?: string;
    /** Soft reference to the MJ Artifact holding the document to sign, if any. */
    artifactId?: string;
    /** The document to be signed (resolved from the artifact by the caller). */
    document?: { bytes: Buffer; filename: string; contentType: string };
}

/**
 * Pluggable e-signature provider boundary. Implementations integrate a specific
 * e-signature service (DocuSign, Adobe Sign, etc.). The default implementation is a
 * stub so the data model and UI flow work end-to-end without external credentials.
 *
 * Register concrete providers via @RegisterClass(BaseSignatureProvider, '<Provider Name>')
 * and resolve them by name through MJGlobal's ClassFactory — mirroring how the app's
 * communication provider is wired.
 */
export abstract class BaseSignatureProvider {
    /** Creates (and optionally sends) a signature envelope. */
    abstract createEnvelope(params: CreateEnvelopeParams): Promise<CreateEnvelopeResult>;

    /** Returns the current status of a previously created envelope. */
    abstract getStatus(externalEnvelopeId: string): Promise<EnvelopeStatusResult>;
}

/** Environment configuration for the DocuSign integration. */
interface DocuSignConfig {
    integrationKey: string;
    userId: string;
    accountId: string;
    /** OAuth base, e.g. 'account-d.docusign.com' (demo) or 'account.docusign.com' (prod). */
    oauthBase: string;
    /** REST base URI for the account, e.g. 'https://demo.docusign.net/restapi'. */
    restBase: string;
    /** RSA private key (PEM) for the JWT grant. */
    privateKey: string;
}

function readDocuSignConfig(): DocuSignConfig | null {
    const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
    const userId = process.env.DOCUSIGN_USER_ID;
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
    const privateKey = (process.env.DOCUSIGN_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!integrationKey || !userId || !accountId || !privateKey) {
        return null;
    }
    return {
        integrationKey,
        userId,
        accountId,
        privateKey,
        oauthBase: process.env.DOCUSIGN_OAUTH_BASE || 'account-d.docusign.com',
        restBase: process.env.DOCUSIGN_REST_BASE || 'https://demo.docusign.net/restapi',
    };
}

/** Maps a DocuSign envelope status string onto our SignatureRequest lifecycle. */
function mapDocuSignStatus(status: string): EnvelopeStatusResult['status'] {
    switch ((status || '').toLowerCase()) {
        case 'sent':
        case 'delivered':
            return 'Sent';
        case 'completed':
        case 'signed':
            return 'Signed';
        case 'declined':
            return 'Declined';
        case 'voided':
            return 'Cancelled';
        case 'created':
            return 'Draft';
        default:
            return 'Unknown';
    }
}

/**
 * DocuSign signature provider — real eSignature REST integration via the JWT grant flow.
 *
 * Requires environment configuration (returns a clear error if absent so the app still
 * runs without DocuSign credentials):
 *   DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID, DOCUSIGN_PRIVATE_KEY
 *   DOCUSIGN_OAUTH_BASE (default account-d.docusign.com), DOCUSIGN_REST_BASE
 *   (default https://demo.docusign.net/restapi)
 *
 * The DocuSign user must have granted consent for the JWT scopes (signature impersonation).
 */
@RegisterClass(BaseSignatureProvider, 'DocuSign')
export class DocuSignSignatureProvider extends BaseSignatureProvider {
    /** Obtains an OAuth access token via the JWT grant. */
    private async getAccessToken(config: DocuSignConfig): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const assertion = jwtSign(
            {
                iss: config.integrationKey,
                sub: config.userId,
                aud: config.oauthBase,
                iat: now,
                exp: now + 3600,
                scope: 'signature impersonation',
            },
            config.privateKey,
            { algorithm: 'RS256' }
        );

        const resp = await fetch(`https://${config.oauthBase}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion,
            }),
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`DocuSign auth failed (${resp.status}): ${text}`);
        }
        const json = (await resp.json()) as { access_token?: string };
        if (!json.access_token) {
            throw new Error('DocuSign auth returned no access token');
        }
        return json.access_token;
    }

    async createEnvelope(params: CreateEnvelopeParams): Promise<CreateEnvelopeResult> {
        const config = readDocuSignConfig();
        if (!config) {
            return {
                success: false,
                errorMessage: 'DocuSign is not configured. Set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID, and DOCUSIGN_PRIVATE_KEY.',
            };
        }
        if (!params.document) {
            return { success: false, errorMessage: 'No document was provided to sign (attach an artifact to the signature request).' };
        }

        try {
            const accessToken = await this.getAccessToken(config);

            const ext = (params.document.filename.split('.').pop() || 'pdf').toLowerCase();
            const envelopeDefinition = {
                emailSubject: params.title || 'Please sign this document',
                status: 'sent',
                documents: [
                    {
                        documentBase64: params.document.bytes.toString('base64'),
                        name: params.document.filename,
                        fileExtension: ext,
                        documentId: '1',
                    },
                ],
                recipients: {
                    signers: [
                        {
                            email: params.signerEmail,
                            name: params.signerName || params.signerEmail,
                            recipientId: '1',
                            tabs: {
                                signHereTabs: [
                                    { documentId: '1', pageNumber: '1', xPosition: '100', yPosition: '100' },
                                ],
                            },
                        },
                    ],
                },
            };

            const resp = await fetch(
                `${config.restBase}/v2.1/accounts/${config.accountId}/envelopes`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(envelopeDefinition),
                }
            );
            if (!resp.ok) {
                const text = await resp.text();
                return { success: false, errorMessage: `DocuSign envelope creation failed (${resp.status}): ${text}` };
            }
            const json = (await resp.json()) as { envelopeId?: string };
            if (!json.envelopeId) {
                return { success: false, errorMessage: 'DocuSign did not return an envelope ID' };
            }
            return { success: true, externalEnvelopeId: json.envelopeId };
        } catch (e) {
            return { success: false, errorMessage: e instanceof Error ? e.message : String(e) };
        }
    }

    async getStatus(externalEnvelopeId: string): Promise<EnvelopeStatusResult> {
        const config = readDocuSignConfig();
        if (!config) {
            return { status: 'Unknown', errorMessage: 'DocuSign is not configured.' };
        }
        try {
            const accessToken = await this.getAccessToken(config);
            const resp = await fetch(
                `${config.restBase}/v2.1/accounts/${config.accountId}/envelopes/${externalEnvelopeId}`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            if (!resp.ok) {
                const text = await resp.text();
                return { status: 'Unknown', errorMessage: `DocuSign status check failed (${resp.status}): ${text}` };
            }
            const json = (await resp.json()) as { status?: string };
            return { status: mapDocuSignStatus(json.status || '') };
        } catch (e) {
            return { status: 'Unknown', errorMessage: e instanceof Error ? e.message : String(e) };
        }
    }
}
