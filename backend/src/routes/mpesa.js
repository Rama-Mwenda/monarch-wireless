const express   = require('express');
const db        = require('../db');
const mpesa     = require('../services/mpesa');
const kopokopo  = require('../services/kopokopo');
const sms       = require('../services/sms');
const macAuth   = require('../helpers/mac-auth-helper');
const punchcard = require('../helpers/punchcard');
const { parseMpesaMessage } = require('../helpers/mpesa-parser');

// ── Get active payment provider ───────────────────────────────
function getActiveProvider() {
  try {
    const p = db.prepare("SELECT name FROM payment_providers WHERE is_default = 1 LIMIT 1").get();
    return p?.name || 'mpesa';
  } catch { return 'mpesa'; }
}

// ── Extract clean M-Pesa receipt from KopoKopo response ───────
// KopoKopo sometimes returns a full URL as the receipt/reference.
// This strips it down to just the M-Pesa transaction code (e.g. UCHOP9JROS).
function extractReceipt(raw) {
  if (!raw) return raw;
  const str = String(raw);
  // If it looks like a URL, take the last path segment
  if (str.startsWith('http')) return str.split('/').pop();
  return str;
}

const router = express.Router();

// ── POST /api/mpesa/stk-push ─────────────────────────────────
// Initiate payment — called from captive portal or admin dashboard
router.post('/stk-push', async (req, res) => {
  const { phone, package_id, mac, ap_mac, ssid_name, radio_id } = req.body;

  if (!phone || !package_id) {
    return res.status(400).json({ error: 'phone and package_id are required' });
  }

  // Load package
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND is_active = 1').get(package_id);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });

  // Get or create user
  const normPhone = mpesa.normalisePhone(phone);
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(normPhone);
  if (!user) {
    db.prepare(`INSERT INTO users (phone) VALUES (?)`).run(normPhone);
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(normPhone);
  }

  const provider = getActiveProvider();
  console.log(`STK Push via provider: ${provider}`);

  try {
    // Ensure MAC columns exist
    try {
      db.prepare('ALTER TABLE mpesa_transactions ADD COLUMN client_mac TEXT').run();
      db.prepare('ALTER TABLE mpesa_transactions ADD COLUMN ap_mac TEXT').run();
      db.prepare('ALTER TABLE mpesa_transactions ADD COLUMN ssid_name TEXT').run();
      db.prepare('ALTER TABLE mpesa_transactions ADD COLUMN radio_id INTEGER').run();
      db.prepare('ALTER TABLE mpesa_transactions ADD COLUMN provider TEXT').run();
    } catch(e) { /* columns already exist */ }

    if (provider === 'kopokopo') {
      // ── KopoKopo STK Push ───────────────────────────────
      const result = await kopokopo.stkPush({
        phone:       normPhone,
        amount:      pkg.price,
        packageName: pkg.name,
        reference:   'MONARCH',
      });

      const checkoutId = result.paymentId || result.location;

      db.prepare(`
        INSERT INTO mpesa_transactions
          (checkout_request_id, merchant_request_id, phone, amount, package_id,
           site_id, status, client_mac, ap_mac, ssid_name, radio_id, provider)
        VALUES (?, ?, ?, ?, ?, (SELECT id FROM sites LIMIT 1), 'pending', ?, ?, ?, ?, 'kopokopo')
      `).run(checkoutId, checkoutId, normPhone, pkg.price, pkg.id,
             mac || null, ap_mac || null, ssid_name || null, radio_id || null);

      return res.json({
        message:             'STK Push sent — check your phone',
        checkout_request_id: checkoutId,
        provider:            'kopokopo',
      });

    } else {
      // ── M-Pesa STK Push (default) ────────────────────────
      const result = await mpesa.stkPush({
        phone:       normPhone,
        amount:      pkg.price,
        packageName: pkg.name,
        packageId:   pkg.id,
        accountRef:  'MonarchWifi',
      });

      if (result.ResponseCode !== '0') {
        return res.status(502).json({ error: result.ResponseDescription || 'STK Push failed' });
      }

      db.prepare(`
        INSERT INTO mpesa_transactions
          (checkout_request_id, merchant_request_id, phone, amount, package_id,
           site_id, status, client_mac, ap_mac, ssid_name, radio_id, provider)
        VALUES (?, ?, ?, ?, ?, (SELECT id FROM sites LIMIT 1), 'pending', ?, ?, ?, ?, 'mpesa')
      `).run(
        result.CheckoutRequestID, result.MerchantRequestID,
        normPhone, pkg.price, pkg.id,
        mac || null, ap_mac || null, ssid_name || null, radio_id || null
      );

      return res.json({
        message:              'STK Push sent — check your phone',
        checkout_request_id:  result.CheckoutRequestID,
        merchant_request_id:  result.MerchantRequestID,
        customer_message:     result.CustomerMessage,
        provider:             'mpesa',
      });
    }

  } catch (err) {
    const errData = err.response?.data || {};
    console.error('STK Push error:', errData || err.message);

    // KopoKopo 429 — pending STK push already active for this number
    if (errData.error_code === 429) {
      return res.status(429).json({
        error: 'A payment prompt is already pending on your phone. Please check your M-Pesa messages and complete or cancel it first, then try again.',
      });
    }

    res.status(502).json({
      error:  'Payment request failed',
      detail: errData || err.message,
    });
  }
});

// ── GET /api/mpesa/status/:checkoutId ────────────────────────
// Poll payment status — frontend polls this after STK Push
router.get('/status/:checkoutId', async (req, res) => {
  const { checkoutId } = req.params;

  const txn = db.prepare(`
    SELECT t.*, p.name as package_name, p.duration_minutes
    FROM mpesa_transactions t
    LEFT JOIN packages p ON t.package_id = p.id
    WHERE t.checkout_request_id = ?
  `).get(checkoutId);

  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  if (txn.status === 'success') return res.json({ status: 'success', txn });
  if (txn.status === 'failed' || txn.status === 'cancelled') {
    return res.json({ status: txn.status, txn });
  }

  // Still pending — query provider directly
  try {
    if (txn.provider === 'kopokopo') {
      // For KopoKopo, just return pending — callback will arrive
      return res.json({ status: 'pending', message: 'Waiting for payment confirmation' });
    }

    const result = await mpesa.stkQuery(checkoutId);
    const code = parseInt(result.ResultCode);

    if (code === 0) {
      return res.json({ status: 'success', txn });
    } else if (code === 1032) {
      db.prepare(`UPDATE mpesa_transactions SET status='cancelled', result_code=?, result_desc=?, completed_at=datetime('now') WHERE checkout_request_id=?`)
        .run(code, result.ResultDesc, checkoutId);
      return res.json({ status: 'cancelled', message: result.ResultDesc });
    } else {
      return res.json({ status: 'pending', message: 'Waiting for payment confirmation' });
    }
  } catch (err) {
    return res.json({ status: 'pending', message: 'Waiting for payment confirmation' });
  }
});

// ── POST /api/mpesa/verify/:checkoutId ───────────────────────
// "Already Paid?" manual verification — queries provider directly
// Called when customer has paid but callback hasn't arrived yet
router.post('/verify/:checkoutId', async (req, res) => {
  const { checkoutId } = req.params;

  const txn = db.prepare(`
    SELECT t.*, p.name as package_name, p.duration_minutes,
           p.loyalty_points, p.price as pkg_price
    FROM mpesa_transactions t
    LEFT JOIN packages p ON t.package_id = p.id
    WHERE t.checkout_request_id = ?
  `).get(checkoutId);

  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  // Already processed — return existing session
  if (txn.status === 'success') {
    return res.json({ status: 'success', already_processed: true, txn });
  }

  if (txn.status === 'failed' || txn.status === 'cancelled') {
    return res.json({ status: txn.status, message: 'Payment was not completed' });
  }

  // Query KopoKopo directly for payment status
  try {
    if (txn.provider === 'kopokopo') {
      const k2Status = await kopokopo.queryPayment(checkoutId);

      if (!k2Status || (k2Status.status !== 'Received' && k2Status.status !== 'Success')) {
        return res.json({
          status: 'pending',
          message: 'Payment not confirmed yet. Please wait a moment or try again.'
        });
      }

      // Payment confirmed — extract clean receipt
      // FIX: use mpesa_reference first (actual M-Pesa code), fallback and strip URLs
      const rawReceipt = k2Status.mpesa_reference
        || k2Status.event?.resource?.mpesa_reference
        || k2Status.event?.resource?.reference
        || k2Status.reference
        || k2Status.receipt
        || checkoutId;
      const receipt = extractReceipt(rawReceipt);
      const amount  = parseFloat(k2Status.amount || txn.amount);

      // Guard against double processing
      const existing = db.prepare(
        "SELECT id FROM sessions WHERE mpesa_ref = ?"
      ).get(receipt);
      if (existing) {
        return res.json({ status: 'success', already_processed: true, txn });
      }

      // Mark transaction success
      db.prepare(`
        UPDATE mpesa_transactions SET
          status = 'success',
          mpesa_receipt = ?,
          result_code = 0,
          result_desc = 'Verified via manual check',
          completed_at = datetime('now')
        WHERE checkout_request_id = ?
      `).run(receipt, checkoutId);

      // Get or create user
      let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
      if (!user) {
        db.prepare('INSERT INTO users (phone) VALUES (?)').run(txn.phone);
        user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
      }

      const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(txn.package_id);
      if (!pkg) return res.status(500).json({ error: 'Package not found' });

      const endAt = new Date(Date.now() + pkg.duration_minutes * 60 * 1000).toISOString();

      const sessionResult = db.prepare(`
        INSERT INTO sessions
          (user_id, site_id, package_id, payment_method, amount_paid, mpesa_ref,
           loyalty_points_earned, end_at, client_mac, ap_mac, ssid_name, radio_id)
        VALUES (?, ?, ?, 'kopokopo', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        user.id, txn.site_id, pkg.id,
        amount, receipt, pkg.loyalty_points || 0, endAt,
        txn.client_mac || null, txn.ap_mac || null,
        txn.ssid_name  || null, txn.radio_id || null
      );

      // Update user stats
      const newSpent    = (user.total_spent    || 0) + amount;
      const newSessions = (user.total_sessions || 0) + 1;
      const newPoints   = (user.loyalty_points || 0) + (pkg.loyalty_points || 0);
      const newPunch    = (user.punch_count    || 0) + 1;

      db.prepare(`
        UPDATE users SET
          total_spent = ?, total_sessions = ?, loyalty_points = ?,
          punch_count = ?, tier = ?, last_seen = datetime('now')
        WHERE id = ?
      `).run(newSpent, newSessions, newPoints, newPunch, calcTier(newSpent), user.id);

      // Authorize MAC with Omada (non-blocking)
      if (txn.client_mac) {
        macAuth.authorizeSession({
          sessionId:       sessionResult.lastInsertRowid,
          userId:          user.id,
          packageId:       pkg.id,
          clientMac:       txn.client_mac,
          apMac:           txn.ap_mac,
          ssidName:        txn.ssid_name,
          radioId:         txn.radio_id,
          site:            process.env.OMADA_SITE_NAME,
          durationMinutes: pkg.duration_minutes,
        }).catch(e => console.error('MAC auth error:', e.message));
      }

      // Punchcard + SMS (non-blocking)
      if (txn.phone && !txn.phone.startsWith('mac:')) {
        punchcard.checkPunchcard(user.id, txn.phone).catch(console.error);
        sms.sessionStarted({
          phone:       txn.phone,
          packageName: pkg.name,
          duration:    sms.fmtDuration(pkg.duration_minutes),
          expiresAt:   endAt,
          receipt,
        }).catch(console.error);
      }

      console.log(`✅ Manual verify success: ${receipt} KES ${amount} from ${txn.phone}`);

      // Return updated txn for portal success screen
      const updatedTxn = db.prepare(`
        SELECT t.*, p.name as package_name, p.duration_minutes
        FROM mpesa_transactions t
        LEFT JOIN packages p ON t.package_id = p.id
        WHERE t.checkout_request_id = ?
      `).get(checkoutId);

      return res.json({ status: 'success', txn: { ...updatedTxn, end_at: endAt, mpesa_receipt: receipt } });

    } else {
      // M-Pesa — query Daraja
      const result = await mpesa.stkQuery(checkoutId);
      const code = parseInt(result.ResultCode);

      if (code === 0) {
        return res.json({ status: 'success', txn });
      } else {
        return res.json({
          status: 'pending',
          message: 'Payment not confirmed yet. Please wait a moment.'
        });
      }
    }

  } catch (err) {
    console.error('Verify error:', err.message);
    return res.json({
      status: 'pending',
      message: 'Could not verify payment right now. Please wait a moment.'
    });
  }
});

// ── POST /api/mpesa/callback ─────────────────────────────────
router.post('/callback', async (req, res) => {
  console.log('M-Pesa callback received:', JSON.stringify(req.body, null, 2));
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const cb = mpesa.parseCallback(req.body);
    if (!cb) return;

    const { resultCode, resultDesc, checkoutId, mpesaReceipt, amount, phone } = cb;

    const txn = db.prepare('SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?').get(checkoutId);
    if (!txn) {
      console.error('Callback for unknown checkout ID:', checkoutId);
      return;
    }

    if (resultCode === 0) {
      console.log(`✅ Payment success: ${mpesaReceipt} KES ${amount} from ${phone}`);

      db.prepare(`
        UPDATE mpesa_transactions SET
          status = 'success', mpesa_receipt = ?, result_code = 0,
          result_desc = ?, completed_at = datetime('now')
        WHERE checkout_request_id = ?
      `).run(mpesaReceipt, resultDesc, checkoutId);

      const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(txn.package_id);
      if (!pkg) return;

      let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
      if (!user) {
        db.prepare('INSERT INTO users (phone) VALUES (?)').run(txn.phone);
        user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
      }

      const endAt = new Date(Date.now() + pkg.duration_minutes * 60 * 1000).toISOString();

      // FIX: include client_mac, ap_mac, ssid_name, radio_id in session INSERT
      const sessionResult = db.prepare(`
        INSERT INTO sessions
          (user_id, site_id, package_id, payment_method, amount_paid, mpesa_ref,
           loyalty_points_earned, end_at, client_mac, ap_mac, ssid_name, radio_id)
        VALUES (?, ?, ?, 'mpesa', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        user.id, txn.site_id, pkg.id,
        amount || txn.amount, mpesaReceipt,
        pkg.loyalty_points || 0, endAt,
        txn.client_mac || null, txn.ap_mac  || null,
        txn.ssid_name  || null, txn.radio_id || null
      );

      const newSpent    = (user.total_spent    || 0) + (amount || txn.amount);
      const newSessions = (user.total_sessions || 0) + 1;
      const newPoints   = (user.loyalty_points || 0) + (pkg.loyalty_points || 0);
      const newPunch    = (user.punch_count    || 0) + 1;

      db.prepare(`
        UPDATE users SET total_spent=?, total_sessions=?, loyalty_points=?,
          punch_count=?, tier=?, last_seen=datetime('now') WHERE id=?
      `).run(newSpent, newSessions, newPoints, newPunch, calcTier(newSpent), user.id);

      console.log(`Session created for ${txn.phone} — ${pkg.name} until ${endAt}`);

      // FIX: use sessionResult.lastInsertRowid not txn.id
      if (txn.client_mac) {
        macAuth.authorizeSession({
          sessionId:       sessionResult.lastInsertRowid,
          userId:          user.id,
          packageId:       pkg.id,
          clientMac:       txn.client_mac,
          apMac:           txn.ap_mac,
          ssidName:        txn.ssid_name,
          radioId:         txn.radio_id,
          site:            process.env.OMADA_SITE_NAME,
          durationMinutes: pkg.duration_minutes,
        }).catch(e => console.error('MAC auth error:', e.message));
      }

      if (txn.phone && !txn.phone.startsWith('mac:')) {
        punchcard.checkPunchcard(user.id, txn.phone).catch(console.error);
        sms.sessionStarted({
          phone: txn.phone, packageName: pkg.name,
          duration: sms.fmtDuration(pkg.duration_minutes), expiresAt: endAt, receipt: mpesaReceipt,
        }).catch(console.error);
      }

    } else {
      console.log(`❌ Payment failed (${resultCode}): ${resultDesc}`);
      db.prepare(`
        UPDATE mpesa_transactions SET status='failed', result_code=?, result_desc=?, completed_at=datetime('now')
        WHERE checkout_request_id=?
      `).run(resultCode, resultDesc, checkoutId);
    }

  } catch (err) {
    console.error('Callback processing error:', err.message);
  }
});

// ── POST /api/mpesa/k2-callback ───────────────────────────────
router.post('/k2-callback', async (req, res) => {
  console.log('KopoKopo callback received:', JSON.stringify(req.body, null, 2));
  res.json({ success: true });

  try {
    const data      = req.body?.data?.attributes || req.body;
    const status    = data.status;
    const paymentId = data.id || req.body?.data?.id;
    const amount    = parseFloat(data.amount || data.event?.resource?.amount || 0);
    const phone     = data.event?.resource?.sender_phone_number || data.sender_msisdn || '';

    // FIX: prefer mpesa_reference (actual M-Pesa code), strip URLs from fallbacks
    const rawReceipt = data.event?.resource?.mpesa_reference
      || data.event?.resource?.reference
      || data.reference
      || paymentId;
    const receipt = extractReceipt(rawReceipt);

    if (status !== 'Received' && status !== 'Success') {
      console.log(`K2 callback ignored — status: ${status}`);
      return;
    }

    const txn = db.prepare(
      "SELECT * FROM mpesa_transactions WHERE checkout_request_id = ? AND provider = 'kopokopo'"
    ).get(paymentId);

    if (!txn) {
      console.error('K2 callback — no matching transaction for ID:', paymentId);
      return;
    }

    // Guard against double processing
    if (txn.status === 'success') {
      console.log(`K2 callback — already processed: ${paymentId}`);
      return;
    }

    db.prepare(`
      UPDATE mpesa_transactions SET
        status = 'success', mpesa_receipt = ?, result_code = 0,
        result_desc = 'KopoKopo payment received', completed_at = datetime('now')
      WHERE checkout_request_id = ?
    `).run(receipt, paymentId);

    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(txn.package_id);
    if (!pkg) return;

    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
    if (!user) {
      db.prepare('INSERT INTO users (phone) VALUES (?)').run(txn.phone);
      user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
    }

    // Guard against duplicate session
    const existingSession = db.prepare("SELECT id FROM sessions WHERE mpesa_ref = ?").get(receipt);
    if (existingSession) {
      console.log(`K2 callback — session already exists for receipt: ${receipt}`);
      return;
    }

    const endAt = new Date(Date.now() + pkg.duration_minutes * 60 * 1000).toISOString();

    // FIX: include client_mac, ap_mac, ssid_name, radio_id in session INSERT
    const sessionResult = db.prepare(`
      INSERT INTO sessions
        (user_id, site_id, package_id, payment_method, amount_paid, mpesa_ref,
         loyalty_points_earned, end_at, client_mac, ap_mac, ssid_name, radio_id)
      VALUES (?, ?, ?, 'kopokopo', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id, txn.site_id, pkg.id,
      amount || txn.amount, receipt,
      pkg.loyalty_points || 0, endAt,
      txn.client_mac || null, txn.ap_mac  || null,
      txn.ssid_name  || null, txn.radio_id || null
    );

    const newSpent    = (user.total_spent    || 0) + (amount || txn.amount);
    const newSessions = (user.total_sessions || 0) + 1;
    const newPoints   = (user.loyalty_points || 0) + (pkg.loyalty_points || 0);
    const newPunch    = (user.punch_count    || 0) + 1;

    db.prepare(`
      UPDATE users SET total_spent=?, total_sessions=?, loyalty_points=?,
        punch_count=?, tier=?, last_seen=datetime('now') WHERE id=?
    `).run(newSpent, newSessions, newPoints, newPunch, calcTier(newSpent), user.id);

    if (txn.client_mac) {
      macAuth.authorizeSession({
        sessionId:       sessionResult.lastInsertRowid,
        userId:          user.id,
        packageId:       pkg.id,
        clientMac:       txn.client_mac,
        apMac:           txn.ap_mac,
        ssidName:        txn.ssid_name,
        radioId:         txn.radio_id,
        site:            process.env.OMADA_SITE_NAME,
        durationMinutes: pkg.duration_minutes,
      }).catch(e => console.error('MAC auth error:', e.message));
    }

    if (txn.phone && !txn.phone.startsWith('mac:')) {
      punchcard.checkPunchcard(user.id, txn.phone).catch(console.error);
      sms.sessionStarted({
        phone: txn.phone, packageName: pkg.name,
        duration: sms.fmtDuration(pkg.duration_minutes), expiresAt: endAt, receipt,
      }).catch(console.error);
    }

    console.log(`✅ KopoKopo payment success: ${receipt} KES ${amount} from ${txn.phone}`);

  } catch (err) {
    console.error('K2 callback error:', err.message);
  }
});

// ── POST /api/mpesa/claim ─────────────────────────────────────
// Manual claim — customer pastes full M-Pesa message to recover
// a paid session when the automatic callback was delayed or missed.
// Only works for payments initiated via the portal STK push.
router.post('/claim', async (req, res) => {
  const { message, mac, ap_mac, ssid_name, radio_id } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Please paste your full M-Pesa confirmation message.' });
  }

  // ── Parse the M-Pesa message ──────────────────────────────────
  const parsed = parseMpesaMessage(message);
  if (!parsed) {
    return res.status(400).json({
      error: 'Could not read that message. Please paste the full M-Pesa confirmation SMS exactly as received.',
    });
  }

  const { transactionId, amount, tillNumber, parsedDate } = parsed;

  // ── Validate till number against active provider config ───────
  const provider = getActiveProvider();
  let configuredTill = null;

  try {
    if (provider === 'kopokopo') {
      const cfg = kopokopo.getCfg();
      configuredTill = cfg.tillNumber;
    } else {
      // M-Pesa Daraja — get shortcode from payment_config
      const row = db.prepare("SELECT value FROM payment_config WHERE key = 'mpesa_shortcode'").get();
      configuredTill = row?.value;
    }
  } catch { /* fall through */ }

  if (configuredTill && tillNumber && String(tillNumber) !== String(configuredTill)) {
    return res.status(400).json({
      error: `This payment was made to till ${tillNumber}, not to Monarch Wireless. Please ensure you paid the correct till number.`,
    });
  }

  // ── Validate datetime — must be within last 24 hours ──────────
  if (parsedDate) {
    const ageHours = (Date.now() - parsedDate.getTime()) / (1000 * 60 * 60);
    if (ageHours > 24) {
      return res.status(400).json({
        error: 'This M-Pesa message is more than 24 hours old and cannot be used to claim access.',
      });
    }
  }

  // ── Check transaction ID exists in our DB ─────────────────────
  const txn = db.prepare(`
    SELECT t.*, p.name as package_name, p.duration_minutes,
           p.loyalty_points, p.price as pkg_price
    FROM mpesa_transactions t
    LEFT JOIN packages p ON t.package_id = p.id
    WHERE t.mpesa_receipt = ? OR t.checkout_request_id = ?
  `).get(transactionId, transactionId);

  if (!txn) {
    return res.status(404).json({
      error: 'This payment was not initiated via the Monarch Wireless portal. Only payments made through the portal can be claimed here.',
    });
  }

  // ── Check amount matches ──────────────────────────────────────
  if (amount && txn.amount && Math.abs(amount - txn.amount) > 0.5) {
    return res.status(400).json({
      error: `Payment amount KES ${amount} does not match the expected amount for this transaction.`,
    });
  }

  // ── Check not already claimed ─────────────────────────────────
  const existingSession = db.prepare(
    "SELECT id FROM sessions WHERE mpesa_ref = ?"
  ).get(transactionId);

  if (existingSession) {
    return res.status(409).json({
      error: 'This payment has already been used to activate a session. If you believe this is an error, please contact the host.',
    });
  }

  // ── Transaction must be success status ────────────────────────
  if (txn.status !== 'success') {
    return res.status(400).json({
      error: `This payment has status "${txn.status}". Only successful payments can be claimed.`,
    });
  }

  // ── All checks passed — create session ───────────────────────
  try {
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(txn.package_id);
    if (!pkg) return res.status(500).json({ error: 'Package not found for this transaction.' });

    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
    if (!user) {
      db.prepare('INSERT INTO users (phone) VALUES (?)').run(txn.phone);
      user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
    }

    const endAt = new Date(Date.now() + pkg.duration_minutes * 60 * 1000).toISOString();
    const receipt = transactionId;

    const sessionResult = db.prepare(`
      INSERT INTO sessions
        (user_id, site_id, package_id, payment_method, amount_paid, mpesa_ref,
         loyalty_points_earned, end_at, client_mac, ap_mac, ssid_name, radio_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id, txn.site_id, pkg.id,
      txn.provider || 'kopokopo',
      txn.amount, receipt,
      pkg.loyalty_points || 0, endAt,
      mac || txn.client_mac || null,
      ap_mac || txn.ap_mac || null,
      ssid_name || txn.ssid_name || null,
      radio_id || txn.radio_id || null
    );

    // Update user stats
    const newSpent    = (user.total_spent    || 0) + txn.amount;
    const newSessions = (user.total_sessions || 0) + 1;
    const newPoints   = (user.loyalty_points || 0) + (pkg.loyalty_points || 0);
    const newPunch    = (user.punch_count    || 0) + 1;

    db.prepare(`
      UPDATE users SET total_spent=?, total_sessions=?, loyalty_points=?,
        punch_count=?, tier=?, last_seen=datetime('now') WHERE id=?
    `).run(newSpent, newSessions, newPoints, newPunch, calcTier(newSpent), user.id);

    // Authorize MAC with Omada (non-blocking)
    const clientMac = mac || txn.client_mac;
    if (clientMac) {
      macAuth.authorizeSession({
        sessionId:       sessionResult.lastInsertRowid,
        userId:          user.id,
        packageId:       pkg.id,
        clientMac,
        apMac:           ap_mac || txn.ap_mac,
        ssidName:        ssid_name || txn.ssid_name,
        radioId:         radio_id || txn.radio_id,
        site:            process.env.OMADA_SITE_NAME,
        durationMinutes: pkg.duration_minutes,
      }).catch(e => console.error('MAC auth error (claim):', e.message));
    }

    // Punchcard + SMS (non-blocking)
    if (txn.phone && !txn.phone.startsWith('mac:')) {
      punchcard.checkPunchcard(user.id, txn.phone).catch(console.error);
      sms.sessionStarted({
        phone:       txn.phone,
        packageName: pkg.name,
        duration:    sms.fmtDuration(pkg.duration_minutes),
        expiresAt:   endAt,
        receipt,
      }).catch(console.error);
    }

    console.log(`✅ Manual claim success: ${receipt} KES ${txn.amount} — ${pkg.name}`);

    return res.json({
      status:  'success',
      txn: {
        mpesa_receipt:    receipt,
        end_at:           endAt,
        package_name:     pkg.name,
        duration_minutes: pkg.duration_minutes,
      },
    });

  } catch (err) {
    console.error('Claim error:', err.message);
    return res.status(500).json({ error: 'Failed to activate session. Please contact the host.' });
  }
});


router.get('/transactions', async (req, res) => {
  const txns = db.prepare(`
    SELECT t.*, p.name as package_name
    FROM mpesa_transactions t
    LEFT JOIN packages p ON t.package_id = p.id
    ORDER BY t.created_at DESC
    LIMIT 100
  `).all();
  res.json({ transactions: txns });
});

function calcTier(totalSpent) {
  if (totalSpent >= 5000) return 'platinum';
  if (totalSpent >= 2000) return 'gold';
  if (totalSpent >= 500)  return 'silver';
  return 'bronze';
}

module.exports = router;