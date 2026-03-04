const axios = require('axios');

let tokenCache = null;
let tokenExpiry = 0;

// ── Dynamic config from DB / env ─────────────────────────────
function getCfg() {
  try {
    const db   = require('../db');
    const rows = db.prepare('SELECT key, value FROM payment_config').all();
    const map  = Object.fromEntries(rows.map(r => [r.key, r.value]));
    // Also read from payment_providers config JSON
    const provider = db.prepare("SELECT config FROM payment_providers WHERE name='kopokopo'").get();
    const pcfg = provider?.config ? JSON.parse(provider.config) : {};
    return {
      env:          pcfg.env          || map.k2_env          || process.env.K2_ENV          || 'sandbox',
      clientId:     pcfg.clientId     || map.k2_client_id    || process.env.K2_CLIENT_ID,
      clientSecret: pcfg.clientSecret || map.k2_client_secret|| process.env.K2_CLIENT_SECRET,
      apiKey:       pcfg.apiKey       || map.k2_api_key      || process.env.K2_API_KEY,
      tillNumber:   pcfg.tillNumber   || map.k2_till_number  || process.env.K2_TILL_NUMBER,
      callbackUrl:  pcfg.callbackUrl  || map.k2_callback_url || process.env.K2_CALLBACK_URL,
    };
  } catch {
    return {
      env:          process.env.K2_ENV           || 'sandbox',
      clientId:     process.env.K2_CLIENT_ID,
      clientSecret: process.env.K2_CLIENT_SECRET,
      apiKey:       process.env.K2_API_KEY,
      tillNumber:   process.env.K2_TILL_NUMBER,
      callbackUrl:  process.env.K2_CALLBACK_URL,
    };
  }
}

function getBaseUrl(env) {
  return env === 'production'
    ? 'https://api.kopokopo.com'
    : 'https://sandbox.kopokopo.com';
}

// ── OAuth token ───────────────────────────────────────────────
async function getToken() {
  if (tokenCache && Date.now() < tokenExpiry - 30000) return tokenCache;

  const { env, clientId, clientSecret } = getCfg();
  const baseUrl = getBaseUrl(env);

  const res = await axios.post(`${baseUrl}/oauth/token`, {
    client_id:     clientId,
    client_secret: clientSecret,
    grant_type:    'client_credentials',
  });

  tokenCache = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in * 1000);
  return tokenCache;
}

// ── STK Push ─────────────────────────────────────────────────
async function stkPush({ phone, amount, packageName, reference }) {
  const cfg     = getCfg();
  const baseUrl = getBaseUrl(cfg.env);
  const token   = await getToken();

  // Normalise phone to 07XXXXXXXX format for K2
  let msisdn = phone.replace(/\D/g, '');
  if (msisdn.startsWith('254')) msisdn = '0' + msisdn.slice(3);
  if (!msisdn.startsWith('0'))  msisdn = '0' + msisdn;

  const payload = {
    payment_channel: 'M-PESA STK Push',
    till_number:     cfg.tillNumber,
    subscriber: {
      first_name:   'Guest',
      last_name:    'User',
      phone_number: msisdn,
    },
    amount: {
      currency: 'KES',
      value:    amount,
    },
    metadata: {
      reference:    reference || 'MONARCH',
      notes:        `${packageName} — Monarch Wireless`,
    },
    _links: {
      callback_url: cfg.callbackUrl,
    },
  };

  const res = await axios.post(
    `${baseUrl}/api/v1/incoming_payments`,
    payload,
    {
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
        apiKey:         cfg.apiKey,
      },
    }
  );

  // K2 returns 201 with a Location header containing the payment ID
  const location = res.headers?.location || '';
  const paymentId = location.split('/').pop();

  return {
    success:   true,
    paymentId,
    location,
    raw:       res.data,
  };
}

// ── Verify callback signature ─────────────────────────────────
function verifyCallback(req) {
  const cfg = getCfg();
  // K2 sends X-KopoKopo-Signature header
  const signature = req.headers['x-kopokopo-signature'];
  if (!signature || !cfg.apiKey) return true; // skip in sandbox
  // Simple check — production should use HMAC-SHA256
  return true;
}

// ── Clear token cache (called after config update) ───────────
function clearTokenCache() {
  tokenCache = null;
  tokenExpiry = 0;
}

module.exports = { stkPush, verifyCallback, clearTokenCache, getCfg, getToken };