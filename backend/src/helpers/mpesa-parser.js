/**
 * parseMpesaMessage
 * Extracts key fields from a raw M-Pesa SMS confirmation message.
 *
 * Supports formats from:
 *  - Standard M-Pesa STK push (Buy Goods / Till)
 *  - Fuliza M-Pesa
 *  - Lipa Na M-Pesa
 *
 * Returns null if the message doesn't look like an M-Pesa confirmation.
 */
function parseMpesaMessage(text) {
  if (!text || typeof text !== 'string') return null;

  const msg = text.trim();

  // ── Transaction ID ────────────────────────────────────────────
  // M-Pesa transaction IDs are 10 uppercase alphanumeric chars at the start
  const txnMatch = msg.match(/^([A-Z0-9]{10})\b/);
  if (!txnMatch) return null;
  const transactionId = txnMatch[1];

  // ── Amount ────────────────────────────────────────────────────
  // "Ksh10.00" or "KES 10.00" or "Ksh 10.00"
  const amountMatch = msg.match(/[Kk](?:sh|ES)\.?\s*([\d,]+\.?\d*)/);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1].replace(/,/g, ''));

  // ── Till / Paybill number ─────────────────────────────────────
  // "paid to MERCHANT NAME XXXXXX" or "sent to MERCHANT NAME XXXXXX"
  const tillMatch = msg.match(/(?:paid to|sent to)[^0-9]*(\d{5,7})/i);
  const tillNumber = tillMatch ? tillMatch[1] : null;

  // ── DateTime ─────────────────────────────────────────────────
  // "on 14/3/26 at 10:17 AM" or "on 14/3/2026 at 10:17 AM"
  const dateMatch = msg.match(/on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s*[APap][Mm])/i);
  let parsedDate = null;
  if (dateMatch) {
    try {
      const [d, m, y] = dateMatch[1].split('/').map(Number);
      const year = y < 100 ? 2000 + y : y;
      const timeStr = dateMatch[2].trim();
      parsedDate = new Date(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')} ${timeStr}`);
      if (isNaN(parsedDate.getTime())) parsedDate = null;
    } catch { parsedDate = null; }
  }

  // ── Phone number (optional — not present in Fuliza) ───────────
  // "from 2547XXXXXXXX" or sender info
  const phoneMatch = msg.match(/(?:from\s+)?(254\d{9}|07\d{8}|01\d{8})/);
  const phone = phoneMatch ? phoneMatch[1] : null;

  return {
    transactionId,
    amount,
    tillNumber,
    parsedDate,
    phone,
    raw: msg,
  };
}

module.exports = { parseMpesaMessage };
