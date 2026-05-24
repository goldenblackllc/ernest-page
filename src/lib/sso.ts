import crypto from 'crypto';

interface SSOPayload {
  phone: string;
  source: string;
  exp: number;
  nonce: string;
}

// In-memory nonce store to prevent replay attacks.
// In production with multiple instances, use Redis/KV instead.
const usedNonces = new Map<string, number>();

// Clean up expired nonces every 5 minutes
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const [nonce, exp] of usedNonces) {
    if (exp < now) usedNonces.delete(nonce);
  }
}, 5 * 60 * 1000);

/**
 * Verify a signed SSO token from a sister app.
 * Returns the decoded payload if valid, or throws an error.
 */
export function verifySSOToken(token: string): SSOPayload {
  const secret = process.env.SSO_SHARED_SECRET;
  if (!secret) {
    throw new Error('SSO_SHARED_SECRET is not configured');
  }

  // Split token into payload and signature
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid token format');
  }

  const [payloadBase64, signature] = parts;

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');

  if (!crypto.timingSafeEqual(
    Buffer.from(signature, 'base64url'),
    Buffer.from(expectedSignature, 'base64url')
  )) {
    throw new Error('Invalid token signature');
  }

  // Decode payload
  const payload: SSOPayload = JSON.parse(
    Buffer.from(payloadBase64, 'base64url').toString('utf-8')
  );

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('Token has expired');
  }

  // Check nonce (prevent replay)
  if (usedNonces.has(payload.nonce)) {
    throw new Error('Token has already been used');
  }
  usedNonces.set(payload.nonce, payload.exp);

  // Validate phone format
  if (!payload.phone || !payload.phone.startsWith('+')) {
    throw new Error('Invalid phone number in token');
  }

  return payload;
}
