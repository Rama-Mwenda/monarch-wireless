import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import styles from './Login.module.css';

function PasswordStrength({ password }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8)         score++;
  if (password.length >= 12)        score++;
  if (/[A-Z]/.test(password))       score++;
  if (/[0-9]/.test(password))       score++;
  if (/[^A-Za-z0-9]/.test(password))score++;
  const labels = ['','Weak','Fair','Good','Strong','Very Strong'];
  const colors = ['','#ef4444','#f97316','#eab308','#22c55e','#0dbb85'];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{
            height: 3, flex: 1, borderRadius: 2,
            background: i <= score ? colors[score] : 'var(--border)',
            transition: 'background 0.2s',
          }}/>
        ))}
      </div>
      <div style={{ fontSize: 10, color: colors[score], fontFamily: 'var(--font-mono)' }}>
        {labels[score]}
      </div>
    </div>
  );
}

export default function ResetPassword() {
  const [searchParams]   = useSearchParams();
  const navigate          = useNavigate();
  const token             = searchParams.get('token');

  const [status,   setStatus]   = useState('verifying'); // verifying | valid | invalid | success
  const [username, setUsername] = useState('');
  const [form,     setForm]     = useState({ newPassword: '', confirm: '' });
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPw,   setShowPw]   = useState(false);

  // Verify token on mount
  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    api.get(`/auth/verify-reset-token?token=${token}`)
      .then(res => { setUsername(res.data.username); setStatus('valid'); })
      .catch(err => {
        setError(err.response?.data?.error || 'Invalid or expired reset link');
        setStatus('invalid');
      });
  }, [token]);

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) return setError('Passwords do not match');
    if (form.newPassword.length < 8)       return setError('Password must be at least 8 characters');

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: form.newPassword });
      setStatus('success');
      setTimeout(() => navigate('/login'), 2500);
    } catch(err) {
      setError(err.response?.data?.error || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.grid} aria-hidden />
      <div className={styles.card}>

        <div className={styles.logo}>
          <div className={styles.logoMark}>M</div>
          <div>
            <div className={styles.logoName}>Monarch Wireless</div>
            <div className={styles.logoSub}>Admin Console</div>
          </div>
        </div>

        {/* Verifying */}
        {status === 'verifying' && (
          <div className={styles.form} style={{ alignItems: 'center', padding: '32px 0' }}>
            <span className={styles.spinner} />
            <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 12 }}>Verifying reset link…</div>
          </div>
        )}

        {/* Invalid / expired */}
        {status === 'invalid' && (
          <div className={styles.form}>
            <div className={styles.error} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 16, borderRadius: 8 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Reset link invalid</div>
                <div style={{ fontSize: 12 }}>{error || 'This link is invalid or has expired.'}</div>
              </div>
            </div>
            <Link to="/forgot-password" className={styles.btn} style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>
              Request a New Link
            </Link>
            <Link to="/login" className={styles.forgotLink}>
              <ArrowLeft size={13} /> Back to Sign In
            </Link>
          </div>
        )}

        {/* Valid token — show form */}
        {status === 'valid' && (
          <form onSubmit={handleReset} className={styles.form}>
            <div className={styles.alertBox}>
              <KeyRound size={16} color="var(--accent)" />
              <div>
                <div className={styles.alertTitle}>Set a new password</div>
                <div className={styles.alertDesc}>
                  Hi <strong>{username}</strong>, choose a strong new password for your account.
                </div>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>New Password</label>
              <div className={styles.pwRow}>
                <input
                  className={styles.input}
                  type={showPw ? 'text' : 'password'}
                  value={form.newPassword}
                  onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
                  placeholder="Min. 8 characters"
                  autoFocus
                  required
                />
                <button type="button" className={styles.eyeBtn} onClick={() => setShowPw(s => !s)}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <PasswordStrength password={form.newPassword} />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Confirm Password</label>
              <input
                className={styles.input}
                type="password"
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="Re-enter new password"
                required
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? <span className={styles.spinner} /> : 'Set New Password'}
            </button>
          </form>
        )}

        {/* Success */}
        {status === 'success' && (
          <div className={styles.form}>
            <div className={styles.successBox} style={{ flexDirection: 'column', gap: 10, padding: 20, textAlign: 'center' }}>
              <ShieldCheck size={32} color="var(--green)" style={{ margin: '0 auto' }} />
              <div style={{ fontWeight: 600, fontSize: 15 }}>Password reset successfully</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                Redirecting you to the sign in page…
              </div>
            </div>
          </div>
        )}

        <div className={styles.footer}>Monarch Wireless · Nairobi</div>
      </div>
    </div>
  );
}
