const axios = require('axios');

const ENV        = process.env.MPESA_ENV || 'sandbox';
const BASE_URL   = ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

const CONSUMER_KEY    = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const SHORTCODE       = process.env.MPESA_SHORTCODE || '174379';
const PASSKEY         = process.env.MPESA_PASSKEY;
const CALLBACK_URL    = process.env.MPESA_CALLBACK_URL;

let tokenCache = null;
let tokenExpiry = 0;

// ── Step 1: Get OAuth token ──────────────────────────────────
async function getToken() {
  if (tokenCache && Date.now() < tokenExpiry - 30000) return tokenCache;

  const creds = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });

  tokenCache  = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in || 3600) * 1000;
  console.log('M-Pesa token obtained');
  return tokenCache;
}

// ── Step 2: Generate password ────────────────────────────────
function getPassword() {
  const timestamp = getTimestamp();
  const raw = `${SHORTCODE}${PASSKEY}${timestamp}`;
  return {
    password:  Buffer.from(raw).toString('base64'),
    timestamp,
  };
}

function getTimestamp() {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

// ── Step 3: STK Push ─────────────────────────────────────────
async function stkPush({ phone, amount, packageName, packageId, accountRef }) {
  const token = await getToken();
  const { password, timestamp } = getPassword();

  // Normalise phone: 07xx → 2547xx
  const normPhone = normalisePhone(phone);

  const payload = {
    BusinessShortCode: SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   'CustomerPayBillOnline',
    Amount:            Math.ceil(amount),           // must be integer
    PartyA:            normPhone,
    PartyB:            SHORTCODE,
    PhoneNumber:       normPhone,
    CallBackURL:       CALLBACK_URL,
    AccountReference:  accountRef || 'MonarchWifi',
    TransactionDesc:   packageName || 'WiFi Access',
  };

  console.log('STK Push payload:', JSON.stringify(payload, null, 2));

  const res = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  console.log('STK Push response:', JSON.stringify(res.data, null, 2));
  return res.data;
}

// ── Step 4: Query STK Push status ────────────────────────────
async function stkQuery(checkoutRequestId) {
  const token = await getToken();
  const { password, timestamp } = getPassword();

  const res = await axios.post(
    `${BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data;
}

// ── Helpers ───────────────────────────────────────────────────
function normalisePhone(phone) {
  let p = String(phone).replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  if (p.startsWith('+254')) return p.slice(1);         // +2547xx → 2547xx
  if (p.startsWith('0'))   return `254${p.slice(1)}`;  // 07xx    → 2547xx
  if (p.startsWith('7'))   return `254${p}`;            // 7xx     → 2547xx
  return p;
}

function parseCallback(body) {
  const stk = body?.Body?.stkCallback;
  if (!stk) return null;

  const resultCode = stk.ResultCode;
  const resultDesc = stk.ResultDesc;
  const checkoutId = stk.CheckoutRequestID;
  const merchantId = stk.MerchantRequestID;

  let mpesaReceipt = null;
  let amount       = null;
  let phone        = null;

  if (resultCode === 0 && stk.CallbackMetadata?.Item) {
    for (const item of stk.CallbackMetadata.Item) {
      if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = item.Value;
      if (item.Name === 'Amount')              amount       = item.Value;
      if (item.Name === 'PhoneNumber')         phone        = String(item.Value);
    }
  }

  return { resultCode, resultDesc, checkoutId, merchantId, mpesaReceipt, amount, phone };
}

module.exports = { getToken, stkPush, stkQuery, parseCallback, normalisePhone };
