const axios = require('axios');
const path  = require('path');

let tokenCache = null;
let tokenExpiry = 0;

// ── Dynamic config — reads from DB first, falls back to .env ──
function getCfg() {
  try {
    const db  = require('../db');
    const rows = db.prepare('SELECT key, value FROM payment_config').all();
    const map  = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return {
      env:            map.mpesa_env            || process.env.MPESA_ENV            || 'sandbox',
      consumerKey:    map.mpesa_consumer_key    || process.env.MPESA_CONSUMER_KEY,
      consumerSecret: map.mpesa_consumer_secret || process.env.MPESA_CONSUMER_SECRET,
      shortcode:      map.mpesa_shortcode       || process.env.MPESA_SHORTCODE      || '174379',
      passkey:        map.mpesa_passkey         || process.env.MPESA_PASSKEY,
      callbackUrl:    map.mpesa_callback_url    || process.env.MPESA_CALLBACK_URL,
    };
  } catch {
    // DB not ready yet — fall back to env vars
    return {
      env:            process.env.MPESA_ENV            || 'sandbox',
      consumerKey:    process.env.MPESA_CONSUMER_KEY,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET,
      shortcode:      process.env.MPESA_SHORTCODE       || '174379',
      passkey:        process.env.MPESA_PASSKEY,
      callbackUrl:    process.env.MPESA_CALLBACK_URL,
    };
  }
}

// ── OAuth token ───────────────────────────────────────────────
async function getToken() {
  if (tokenCache && Date.now() < tokenExpiry - 30000) return tokenCache;
  const { env, consumerKey, consumerSecret } = getCfg();
  const baseUrl = env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
  const creds = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const res = await axios.get(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  tokenCache  = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in || 3600) * 1000;
  console.log(`M-Pesa token obtained (${env})`);
  return tokenCache;
}

// ── Password ──────────────────────────────────────────────────
function getTimestamp() {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}
function getPassword() {
  const { shortcode, passkey } = getCfg();
  const timestamp = getTimestamp();
  return {
    password:  Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64'),
    timestamp,
  };
}

// ── STK Push ──────────────────────────────────────────────────
async function stkPush({ phone, amount, packageName, packageId, accountRef }) {
  const { env, shortcode, callbackUrl } = getCfg();
  const baseUrl = env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  const token    = await getToken();
  const { password, timestamp } = getPassword();
  const normPhone = normalisePhone(phone);

  const payload = {
    BusinessShortCode: shortcode,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   'CustomerPayBillOnline',
    Amount:            Math.ceil(amount),
    PartyA:            normPhone,
    PartyB:            shortcode,
    PhoneNumber:       normPhone,
    CallBackURL:       callbackUrl,
    AccountReference:  accountRef || 'MonarchWifi',
    TransactionDesc:   packageName || 'WiFi Access',
  };

  console.log('STK Push payload:', JSON.stringify(payload, null, 2));
  const res = await axios.post(
    `${baseUrl}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  console.log('STK Push response:', JSON.stringify(res.data, null, 2));
  return res.data;
}

// ── STK Query ─────────────────────────────────────────────────
async function stkQuery(checkoutRequestId) {
  const { env, shortcode } = getCfg();
  const baseUrl = env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  const token = await getToken();
  const { password, timestamp } = getPassword();
  const res = await axios.post(
    `${baseUrl}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: shortcode,
      Password:          password,
      Timestamp:         timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

// ── Parse callback ────────────────────────────────────────────
function parseCallback(body) {
  const stk = body?.Body?.stkCallback;
  if (!stk) return null;

  const resultCode = stk.ResultCode;
  const resultDesc = stk.ResultDesc;
  const checkoutId = stk.CheckoutRequestID;
  const merchantId = stk.MerchantRequestID;

  let mpesaReceipt = null, amount = null, phone = null;

  if (resultCode === 0 && stk.CallbackMetadata?.Item) {
    for (const item of stk.CallbackMetadata.Item) {
      if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = item.Value;
      if (item.Name === 'Amount')              amount       = item.Value;
      if (item.Name === 'PhoneNumber')         phone        = String(item.Value);
    }
  }

  return { resultCode, resultDesc, checkoutId, merchantId, mpesaReceipt, amount, phone };
}

// ── Phone normalisation ───────────────────────────────────────
function normalisePhone(phone) {
  let p = String(phone).replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  if (p.startsWith('+254')) return p.slice(1);   // +2547xx → 2547xx
  if (p.startsWith('0'))   return `254${p.slice(1)}`; // 07xx → 2547xx
  if (p.startsWith('7'))   return `254${p}`;          // 7xx  → 2547xx
  return p;
}

function clearTokenCache() {
  tokenCache  = null;
  tokenExpiry = 0;
}

module.exports = { getToken, stkPush, stkQuery, parseCallback, normalisePhone, clearTokenCache };