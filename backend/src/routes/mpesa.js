const express = require('express');
const db      = require('../db');
const mpesa   = require('../services/mpesa');

const router = express.Router();

// ── POST /api/mpesa/stk-push ─────────────────────────────────
// Initiate payment — called from captive portal or admin dashboard
router.post('/stk-push', async (req, res) => {
  const { phone, package_id } = req.body;

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

  try {
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

    // Save pending transaction
    db.prepare(`
      INSERT INTO mpesa_transactions
        (checkout_request_id, merchant_request_id, phone, amount, package_id, site_id, status)
      VALUES (?, ?, ?, ?, ?, (SELECT id FROM sites LIMIT 1), 'pending')
    `).run(
      result.CheckoutRequestID,
      result.MerchantRequestID,
      normPhone,
      pkg.price,
      pkg.id,
    );

    res.json({
      message:              'STK Push sent — check your phone',
      checkout_request_id:  result.CheckoutRequestID,
      merchant_request_id:  result.MerchantRequestID,
      customer_message:     result.CustomerMessage,
    });

  } catch (err) {
    console.error('STK Push error:', err.response?.data || err.message);
    res.status(502).json({
      error:  'M-Pesa request failed',
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
