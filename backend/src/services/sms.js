const axios = require('axios');
const db    = require('../db');

// ── Get active provider config from DB (fallback to .env) ───
function getProvider() {
  try {
    const provider = db.prepare(
      'SELECT * FROM sms_providers WHERE is_default = 1 AND is_active = 1 LIMIT 1'
    ).get();
    if (provider?.api_token) return provider;
  } catch(e) { /* DB not ready yet */ }

  // Fallback to .env
  return {
    name:      'talksasa',
    api_token: process.env.TALKSASA_API_TOKEN,
    sender_id: process.env.TALKSASA_SENDER_ID || 'MonarchWifi',
  };
}

// ── Get template from DB ─────────────────────────────────────
function getTemplate(name) {
  try {
    return db.prepare(
      'SELECT * FROM sms_templates WHERE name = ? AND is_active = 1'
    ).get(name);
  } catch(e) { return null; }
}

// ── Fill template placeholders ───────────────────────────────
function fillTemplate(content, vars) {
  return content.replace(/\[\[(\w+)\]\]/g, (_, key) => vars[key] || '');
}

// ── Get API URL for provider ─────────────────────────────────
function getApiUrl(providerName) {
  const urls = {
    talksasa:        'https://bulksms.talksasa.com/api/v3/sms/send',
    africas_talking: 'https://api.africastalking.com/version1/messaging',
  };
  return urls[providerName] || urls.talksasa;
}

// ── Core send function ───────────────────────────────────────
async function sendSms(phone, message) {
  const provider = getProvider();

  if (!provider?.api_token) {
    console.warn('SMS skipped — no API token configured');
    return { skipped: true };
  }

  const recipient = normalisePhone(phone);
  const apiUrl    = getApiUrl(provider.name);

  try {
    const res = await axios.post(apiUrl, {
      recipient,
      sender_id: provider.sender_id || 'MonarchWifi',
      type:      'plain',
      message,
    }, {
      headers: {
        Authorization: `Bearer ${provider.api_token}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      timeout: 10000,
    });

    const success = res.data?.status === 'success';
    console.log(`SMS ${success ? '✅' : '❌'} to ${recipient}: ${message.slice(0, 50)}...`);
    return { success, data: res.data };

  } catch (err) {
    console.error('SMS error:', err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

// ── Log + send ───────────────────────────────────────────────
async function sendAndLog({ userId, phone, messageType, message }) {
  const result = await sendSms(phone, message);
  try {
    db.prepare(`
      INSERT INTO sms_log (user_id, phone, message_type, body, provider, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId || null, phone, messageType, message,
      getProvider()?.name || 'talksasa',
      result.skipped ? 'sent' : result.success ? 'sent' : 'failed'
    );
  } catch(e) { console.error('SMS log error:', e.message); }
  return result;
}

// ── Templates ────────────────────────────────────────────────
const PORTAL_URL = process.env.PORTAL_URL;
const COMPANY    = 'Monarch Wireless';

function sessionStarted({ userId, phone, packageName, duration, expiresAt, receipt }) {
  const tmpl = getTemplate('session_started');
  const expiry = expiresAt
    ? new Date(expiresAt).toLocaleTimeString('en-KE', {
        hour:     '2-digit',
        minute:   '2-digit',
        hour12:   true,
        timeZone: 'Africa/Nairobi',
      })
    : '';
  const message = tmpl
    ? fillTemplate(tmpl.content, { company: COMPANY, package: packageName, duration, expiry, receipt, portal_url: PORTAL_URL })
    : `✅ ${COMPANY}\nYou're connected! ${packageName} (${duration}). Expires: ${expiry}. Ref: ${receipt}. Enjoy!`;
  return sendAndLog({ userId, phone, messageType: 'session_started', message });
}

function sessionExpiringSoon({ userId, phone, packageName, minutesLeft }) {
  const tmpl = getTemplate('session_expiring');
  const message = tmpl
    ? fillTemplate(tmpl.content, { company: COMPANY, package: packageName, minutes: minutesLeft, portal_url: PORTAL_URL })
    : `⏰ ${COMPANY}\nYour ${packageName} expires in ${minutesLeft} mins. Renew at ${PORTAL_URL}`;
  return sendAndLog({ userId, phone, messageType: 'session_expiring', message });
}

function sessionExpired({ userId, phone, packageName }) {
  const tmpl = getTemplate('session_expired');
  const message = tmpl
    ? fillTemplate(tmpl.content, { company: COMPANY, package: packageName, portal_url: PORTAL_URL })
    : `📴 ${COMPANY}\nYour ${packageName} session has ended. Reconnect at ${PORTAL_URL}`;
  return sendAndLog({ userId, phone, messageType: 'session_expired', message });
}

function voucherRedeemed({ userId, phone, packageName, duration, expiresAt }) {
  const tmpl = getTemplate('voucher_redeemed');
  const expiry = expiresAt
    ? new Date(expiresAt).toLocaleTimeString('en-KE', {
        hour:     '2-digit',
        minute:   '2-digit',
        hour12:   true,
        timeZone: 'Africa/Nairobi',
      })
    : '';
  const message = tmpl
    ? fillTemplate(tmpl.content, { company: COMPANY, package: packageName, duration, expiry, portal_url: PORTAL_URL })
    : `🎫 ${COMPANY}\nVoucher redeemed! ${packageName} (${duration}). Expires: ${expiry}. Enjoy!`;
  return sendAndLog({ userId, phone, messageType: 'voucher_redeemed', message });
}

function customMessage({ userId, phone, message }) {
  const tmpl = getTemplate('custom');
  const body = tmpl
    ? fillTemplate(tmpl.content, { company: COMPANY, message })
    : `${COMPANY}\n${message}`;
  return sendAndLog({ userId, phone, messageType: 'custom', message: body });
}

function normalisePhone(phone) {
  let p = String(phone).replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  if (p.startsWith('+')) return p.slice(1);
  if (p.startsWith('0')) return `254${p.slice(1)}`;
  if (p.startsWith('7')) return `254${p}`;
  return p;
}

function fmtDuration(minutes) {
  if (minutes >= 10080) return `${minutes/10080}wk`;
  if (minutes >= 1440)  return `${minutes/1440}d`;
  if (minutes >= 60)    return `${minutes/60}hr`;
  return `${minutes}min`;
}

module.exports = {
  sendSms, sendAndLog,
  sessionStarted, sessionExpiringSoon, sessionExpired,
  voucherRedeemed, customMessage, fmtDuration,
};