import { useState, useEffect, useRef } from 'react';
import { X, Phone, Wifi, CheckCircle, XCircle, Loader, AlertCircle } from 'lucide-react';
import api from '../services/api';
import styles from './MpesaPayModal.module.css';

const POLL_INTERVAL = 3000;  // poll every 3s
const POLL_TIMEOUT  = 120000; // give up after 2 min

export default function MpesaPayModal({ onClose, preselectedPackage }) {
  const [packages,    setPackages]    = useState([]);
  const [selectedPkg, setSelectedPkg] = useState(preselectedPackage || null);
  const [phone,       setPhone]       = useState('');
  const [stage,       setStage]       = useState('form');   // form | pushing | waiting | success | failed
  const [error,       setError]       = useState(null);
  const [receipt,     setReceipt]     = useState(null);
  const [countdown,   setCountdown]   = useState(120);

  const pollRef      = useRef(null);
  const countdownRef = useRef(null);

  // Load packages
  useEffect(() => {
    api.get('/packages').then(r => {
      const list = Array.isArray(r.data) ? r.data : (r.data.packages || []);
      const active = list.filter(p => p.is_active);
      setPackages(active);
      if (!selectedPkg && active.length > 0) setSelectedPkg(active[0]);
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    clearInterval(pollRef.current);
    clearInterval(countdownRef.current);
  }, []);

  function startCountdown() {
    setCountdown(120);
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownRef.current);
          clearInterval(pollRef.current);
          setStage('failed');
          setError('Payment timed out. Please try again.');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  function startPolling(cid) {
    const started = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - started > POLL_TIMEOUT) {
        clearInterval(pollRef.current);
        clearInterval(countdownRef.current);
        setStage('failed');
        setError('Payment timed out. Please try again.');
        return;
      }
      try {
        const r = await api.get(`/mpesa/status/${cid}`);
        if (r.data.status === 'success') {
          clearInterval(pollRef.current);
          clearInterval(countdownRef.current);
          setReceipt(r.data.txn?.mpesa_receipt);
          setStage('success');
        } else if (r.data.status === 'failed' || r.data.status === 'cancelled') {
          clearInterval(pollRef.current);
          clearInterval(countdownRef.current);
          setStage('failed');
          setError(r.data.message || 'Payment was not completed.');
        }
      } catch (e) {
        console.error('Poll error:', e.message);
      }
    }, POLL_INTERVAL);
  }

  async function handleSubmit() {
    if (!phone || !selectedPkg) return;
    setError(null);
    setStage('pushing');

    try {
      const r = await api.post('/mpesa/stk-push', {
        phone,
        package_id: selectedPkg.id,
      });

      setStage('waiting');
      startCountdown();
      startPolling(r.data.checkout_request_id);

    } catch (err) {
      setStage('form');
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to send STK Push. Check the phone number.');
    }
  }

  function formatDuration(mins) {
    if (mins >= 10080) return `${mins / 10080}wk`;
    if (mins >= 1440)  return `${mins / 1440}d`;
    if (mins >= 60)    return `${mins / 60}h`;
    return `${mins}m`;
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>

        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <div className={styles.mpesaLogo}>M</div>
            M-Pesa Payment
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        {/* ── FORM ── */}
        {stage === 'form' && (
          <div className={styles.body}>
            {/* Package selector */}
            <div className={styles.field}>
              <label className={styles.label}>Select Package</label>
              <div className={styles.pkgGrid}>
                {packages.map(p => (
                  <button key={p.id}
                    className={`${styles.pkgBtn} ${selectedPkg?.id === p.id ? styles.pkgSelected : ''}`}
                    onClick={() => setSelectedPkg(p)}>
                    <span className={styles.pkgName}>{p.name}</span>
                    <span className={styles.pkgPrice}>KES {p.price}</span>
                    <span className={styles.pkgDur}>{formatDuration(p.duration_minutes)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Phone number */}
            <div className={styles.field}>
              <label className={styles.label}>M-Pesa Phone Number</label>
              <div className={styles.phoneRow}>
                <span className={styles.phoneFlag}>🇰🇪 +254</span>
                <input
                  className={styles.phoneInput}
                  type="tel"
                  placeholder="7XX XXX XXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  maxLength={10}
                  autoFocus
                />
              </div>
              <div className={styles.hint}>Enter the number registered with M-Pesa</div>
            </div>

            {error && (
              <div className={styles.errorBox}>
                <AlertCircle size={13} /> {error}
              </div>
            )}

            {/* Summary */}
            {selectedPkg && (
              <div className={styles.summary}>
                <div className={styles.summaryRow}>
                  <span>Package</span>
                  <span>{selectedPkg.name} · {formatDuration(selectedPkg.duration_minutes)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Amount</span>
                  <span className={styles.summaryAmount}>KES {selectedPkg.price}</span>
                </div>
              </div>
            )}

            <button
              className={styles.payBtn}
              onClick={handleSubmit}
              disabled={!phone || phone.length < 9 || !selectedPkg}>
              <Phone size={15} />
              Send STK Push to {phone ? `0${phone.slice(-9)}` : 'phone'}
            </button>
          </div>
        )}

        {/* ── PUSHING ── */}
        {stage === 'pushing' && (
          <div className={styles.statusBody}>
            <div className={styles.spinnerLarge} />
            <div className={styles.statusTitle}>Sending request...</div>
            <div className={styles.statusSub}>Connecting to Safaricom</div>
          </div>
        )}

        {/* ── WAITING ── */}
        {stage === 'waiting' && (
          <div className={styles.statusBody}>
            <div className={styles.phonePrompt}>
              <Phone size={28} color="var(--green)" strokeWidth={1.5} />
            </div>
            <div className={styles.statusTitle}>Check your phone!</div>
            <div className={styles.statusSub}>
              An M-Pesa prompt has been sent to <strong>{phone}</strong>.<br />
              Enter your PIN to complete the payment.
            </div>
            <div className={styles.countdownWrap}>
              <div className={styles.countdownBar}
                style={{ width: `${(countdown / 120) * 100}%` }} />
            </div>
            <div className={styles.countdownText}>{countdown}s remaining</div>
            <div className={styles.waitingPkg}>
              <Wifi size={12} /> {selectedPkg?.name} · KES {selectedPkg?.price}
            </div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {stage === 'success' && (
          <div className={styles.statusBody}>
            <CheckCircle size={52} color="var(--green)" strokeWidth={1.5} />
            <div className={styles.statusTitle} style={{ color: 'var(--green)' }}>Payment Confirmed!</div>
            <div className={styles.statusSub}>
              Your WiFi session has been activated.<br />
              {receipt && <span>M-Pesa Ref: <strong>{receipt}</strong></span>}
            </div>
            <div className={styles.successPkg}>
              <Wifi size={14} /> {selectedPkg?.name} · {formatDuration(selectedPkg?.duration_minutes)} activated
            </div>
            <button className={styles.doneBtn} onClick={onClose}>Done</button>
          </div>
        )}

        {/* ── FAILED ── */}
        {stage === 'failed' && (
          <div className={styles.statusBody}>
            <XCircle size={52} color="var(--red)" strokeWidth={1.5} />
            <div className={styles.statusTitle} style={{ color: 'var(--red)' }}>Payment Failed</div>
            <div className={styles.statusSub}>{error || 'The payment was not completed.'}</div>
            <button className={styles.retryBtn} onClick={() => { setStage('form'); setError(null); }}>
              Try Again
            </button>
          </div>
        )}

      </div>
    </div>
  );
}