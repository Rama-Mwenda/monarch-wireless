import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import api from '../services/api';
import styles from './Login.module.css';

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Please enter your email address');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch(err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
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

        {!sent ? (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.alertBox}>
              <Mail size={16} color="var(--accent)" />
              <div>
                <div className={styles.alertTitle}>Reset your password</div>
                <div className={styles.alertDesc}>
                  Enter the email address on your admin account and we'll send you a reset link.
                </div>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Email Address</label>
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@example.com"
                autoFocus
                required
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? <span className={styles.spinner} /> : 'Send Reset Link'}
            </button>

            <Link to="/login" className={styles.forgotLink}>
              <ArrowLeft size={13} /> Back to Sign In
            </Link>
          </form>
        ) : (
          <div className={styles.form}>
            <div className={styles.successBox} style={{ flexDirection: 'column', gap: 10, padding: 20, textAlign: 'center' }}>
              <CheckCircle size={32} color="var(--green)" style={{ margin: '0 auto' }} />
              <div style={{ fontWeight: 600, fontSize: 15 }}>Check your email</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                If <strong>{email}</strong> is registered, a password reset link has been sent.
                Check your inbox and spam folder.
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                The link expires in 1 hour.
              </div>
            </div>
            <Link to="/login" className={styles.forgotLink}>
              <ArrowLeft size={13} /> Back to Sign In
            </Link>
          </div>
        )}

        <div className={styles.footer}>Monarch Wireless · Nairobi</div>
      </div>
    </div>
  );
}
