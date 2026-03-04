const express   = require('express');
const db        = require('../db');
const mpesa     = require('../services/mpesa');
const kopokopo  = require('../services/kopokopo');
const sms       = require('../services/sms');
const macAuth   = require('../helpers/mac-auth-helper');
const punchcard = require('../helpers/punchcard');

// ── Get active payment provider ───────────────────────────────
function getActiveProvider() {
  try {
    const p = db.prepare("SELECT name FROM payment_providers WHERE is_default = 1 LIMIT 1").get();
    return p?.name || 'mpesa';
  } catch { return 'mpesa'; }
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
    db.prepare(`
      INSERT INTO users (phone) VALUES (?)
    `).run(normPhone);
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

      // K2 returns a payment ID from location header
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
    console.error('STK Push error:', err.response?.data || err.message);
    res.status(502).json({
      error:  'Payment request failed',
      detail: err.response?.data || err.message,
    });
  }
});

// ── GET /api/mpesa/status/:checkoutId ────────────────────────
// Poll payment status — frontend polls this after STK Push
router.get('/status/:checkoutId', async (req, res) => {
  const { checkoutId } = req.params;

  // Check our DB first
  const txn = db.prepare(`
    SELECT t.*, p.name as package_name, p.duration_minutes
    FROM mpesa_transactions t
    LEFT JOIN packages p ON t.package_id = p.id
    WHERE t.checkout_request_id = ?
  `).get(checkoutId);

  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  // If already resolved, return it
  if (txn.status === 'success') {
    return res.json({ status: 'success', txn });
  }
  if (txn.status === 'failed' || txn.status === 'cancelled') {
    return res.json({ status: txn.status, txn });
  }

  // Still pending — query Safaricom directly
  try {
    const result = await mpesa.stkQuery(checkoutId);
    const code = parseInt(result.ResultCode);

    if (code === 0) {
      // Already succeeded but callback might not have arrived yet
      return res.json({ status: 'success', txn });
    } else if (code === 1032) {
      // Cancelled by user
      db.prepare(`UPDATE mpesa_transactions SET status='cancelled', result_code=?, result_desc=?, completed_at=datetime('now') WHERE checkout_request_id=?`)
        .run(code, result.ResultDesc, checkoutId);
      return res.json({ status: 'cancelled', message: result.ResultDesc });
    } else {
      return res.json({ status: 'pending', message: 'Waiting for payment confirmation' });
    }
  } catch (err) {
    // Query endpoint can return errors for still-pending transactions — that's fine
    return res.json({ status: 'pending', message: 'Waiting for payment confirmation' });
  }
});

// ── POST /api/mpesa/callback ─────────────────────────────────
// Safaricom calls this after payment completes — NO auth required
router.post('/callback', async (req, res) => {
  console.log('M-Pesa callback received:', JSON.stringify(req.body, null, 2));

  // Always respond 200 immediately to Safaricom
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const cb = mpesa.parseCallback(req.body);
    if (!cb) return;

    const { resultCode, resultDesc, checkoutId, mpesaReceipt, amount, phone } = cb;

    // Load pending transaction
    const txn = db.prepare('SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?').get(checkoutId);
    if (!txn) {
      console.error('Callback for unknown checkout ID:', checkoutId);
      return;
    }

    if (resultCode === 0) {
      // ── PAYMENT SUCCESS ──────────────────────────────────
      console.log(`✅ Payment success: ${mpesaReceipt} KES ${amount} from ${phone}`);

      // Update transaction
      db.prepare(`
        UPDATE mpesa_transactions SET
          status = 'success',
          mpesa_receipt = ?,
          result_code = 0,
          result_desc = ?,
          completed_at = datetime('now')
        WHERE checkout_request_id = ?
      `).run(mpesaReceipt, resultDesc, checkoutId);

      // Load package
      const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(txn.package_id);
      if (!pkg) return;

      // Get or create user
      let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
      if (!user) {
        db.prepare('INSERT INTO users (phone) VALUES (?)').run(txn.phone);
        user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
      }

      // Create session
      const endAt = new Date(Date.now() + pkg.duration_minutes * 60 * 1000).toISOString();
      db.prepare(`
        INSERT INTO sessions
          (user_id, site_id, package_id, payment_method, amount_paid, mpesa_ref, loyalty_points_earned, end_at)
        VALUES (?, ?, ?, 'mpesa', ?, ?, ?, ?)
      `).run(
        user.id,
        txn.site_id,
        pkg.id,
        amount || txn.amount,
        mpesaReceipt,
        pkg.loyalty_points || 0,
        endAt,
      );

      // Update user stats + tier
      const newSpent    = (user.total_spent || 0) + (amount || txn.amount);
      const newSessions = (user.total_sessions || 0) + 1;
      const newPoints   = (user.loyalty_points || 0) + (pkg.loyalty_points || 0);
      const newPunch    = (user.punch_count || 0) + 1;
      const newTier     = calcTier(newSpent);

      db.prepare(`
        UPDATE users SET
          total_spent    = ?,
          total_sessions = ?,
          loyalty_points = ?,
          punch_count    = ?,
          tier           = ?,
          last_seen      = datetime('now')
        WHERE id = ?
      `).run(newSpent, newSessions, newPoints, newPunch, newTier, user.id);

      console.log(`Session created for ${txn.phone} — ${pkg.name} until ${endAt}`);

      // Authorize MAC with Omada (non-blocking)
      // clientMac stored on transaction from STK push initiation
      if (txn.client_mac) {
        macAuth.authorizeSession({
          sessionId:       sessionId,
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

      // Punchcard check (non-blocking)
      if (txn.phone && !txn.phone.startsWith('mac:')) {
        punchcard.checkPunchcard(user.id, txn.phone).catch(console.error);
      }

      // Send confirmation SMS (non-blocking)
      if (!txn.phone.startsWith('mac:')) {
        sms.sessionStarted({
          phone:       txn.phone,
          packageName: pkg.name,
          duration:    sms.fmtDuration(pkg.duration_minutes),
          expiresAt:   endAt,
          receipt:     mpesaReceipt,
        }).catch(console.error);
      }

    } else {
      // ── PAYMENT FAILED ───────────────────────────────────
      console.log(`❌ Payment failed (${resultCode}): ${resultDesc}`);
      db.prepare(`
        UPDATE mpesa_transactions SET
          status = 'failed',
          result_code = ?,
          result_desc = ?,
          completed_at = datetime('now')
        WHERE checkout_request_id = ?
      `).run(resultCode, resultDesc, checkoutId);
    }

  } catch (err) {
    console.error('Callback processing error:', err.message);
  }
});


// ── POST /api/mpesa/k2-callback ───────────────────────────────
// KopoKopo calls this after payment completes — NO auth required
router.post('/k2-callback', async (req, res) => {
  console.log('KopoKopo callback received:', JSON.stringify(req.body, null, 2));
  res.json({ success: true });

  try {
    const data = req.body?.data?.attributes || req.body;
    const status    = data.status;
    const paymentId = data.id || req.body?.data?.id;
    const amount    = parseFloat(data.amount || data.event?.resource?.amount || 0);
    const phone     = data.event?.resource?.sender_phone_number || data.sender_msisdn || '';
    const receipt   = data.event?.resource?.reference || data.reference || paymentId;

    if (status !== 'Received' && status !== 'Success') {
      console.log(`K2 callback ignored — status: ${status}`);
      return;
    }

    // Find pending transaction by payment ID
    const txn = db.prepare(
      "SELECT * FROM mpesa_transactions WHERE checkout_request_id = ? AND provider = 'kopokopo'"
    ).get(paymentId);

    if (!txn) {
      console.error('K2 callback — no matching transaction for ID:', paymentId);
      return;
    }

    // Mark success
    db.prepare(`
      UPDATE mpesa_transactions SET
        status = 'success',
        mpesa_receipt = ?,
        result_code = 0,
        result_desc = 'KopoKopo payment received',
        completed_at = datetime('now')
      WHERE checkout_request_id = ?
    `).run(receipt, paymentId);

    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(txn.package_id);
    if (!pkg) return;

    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
    if (!user) {
      db.prepare('INSERT INTO users (phone) VALUES (?)').run(txn.phone);
      user = db.prepare('SELECT * FROM users WHERE phone = ?').get(txn.phone);
    }

    const endAt = new Date(Date.now() + pkg.duration_minutes * 60 * 1000).toISOString();
    const sessionResult = db.prepare(`
      INSERT INTO sessions
        (user_id, site_id, package_id, payment_method, amount_paid, mpesa_ref, loyalty_points_earned, end_at)
      VALUES (?, ?, ?, 'kopokopo', ?, ?, ?, ?)
    `).run(user.id, txn.site_id, pkg.id, amount || txn.amount, receipt, pkg.loyalty_points || 0, endAt);

    const newSpent    = (user.total_spent || 0) + (amount || txn.amount);
    const newSessions = (user.total_sessions || 0) + 1;
    const newPoints   = (user.loyalty_points || 0) + (pkg.loyalty_points || 0);
    const newPunch    = (user.punch_count || 0) + 1;
    db.prepare(`
      UPDATE users SET
        total_spent = ?, total_sessions = ?, loyalty_points = ?,
        punch_count = ?, tier = ?, last_seen = datetime('now')
      WHERE id = ?
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
        phone:       txn.phone,
        packageName: pkg.name,
        duration:    sms.fmtDuration(pkg.duration_minutes),
        expiresAt:   endAt,
        receipt,
      }).catch(console.error);
    }

    console.log(`✅ KopoKopo payment success: ${receipt} KES ${amount} from ${txn.phone}`);

  } catch (err) {
    console.error('K2 callback error:', err.message);
  }
});

// ── GET /api/mpesa/transactions ──────────────────────────────
// Admin view of all M-Pesa transactions
router.get('/transactions', async (req, res) => {
  const { requireAuth } = require('../middleware/auth');
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
