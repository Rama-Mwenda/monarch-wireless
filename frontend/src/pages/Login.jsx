import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import styles from './Login.module.css';

export default function Login() {
  const { login } = useAuth();
  const navigate   = useNavigate();

  const [step,    setStep]    = useState('login'); // login | change-password
  const [form,    setForm]    = useState({ username: '', password: '' });
  const [pwForm,  setPwForm]  = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw,  setShowPw]  = useState(false);
  const [token,   setToken]   = useState(null); // temp token for pw change step

  // ── Step 1: Login ────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      if (res.data.mustChangePassword) {
        // Store token temporarily for the change-password call
        setToken(res.data.token);
        setStep('change-password');
      } else {
        const adminData = await login(form.username, form.password);
        if (adminData.role === 'site_manager') navigate('/host');
        else if (adminData.role === 'viewer') navigate('/overview');
        else navigate('/');
      }
    } catch(err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Force password change ───────────────────────
  async function handleChangePassword(e) {
    e.preventDefault();
    setError('');

    if (pwForm.newPassword !== pwForm.confirm)
      return setError('New passwords do not match');
    if (pwForm.newPassword.length < 8)
      return setError('Password must be at least 8 characters');
    if (pwForm.newPassword === 'admin123')
      return setError('Please choose a more secure password');

    setLoading(true);
    try {
      await api.post('/auth/change-password',
        { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Password updated! Signing you in…');
      setTimeout(async () => {
        const adminData = await login(form.username, pwForm.newPassword);
        if (adminData.role === 'site_manager') navigate('/host');
        else if (adminData.role === 'viewer') navigate('/overview');
        else navigate('/');
      }, 1200);
    } catch(err) {
      setError(err.response?.data?.error || 'Failed to update password');
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

        {/* ── LOGIN FORM ── */}
        {step === 'login' && (
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Username or Email</label>
              <input
                className={styles.input}
                type="text"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="admin"
                autoFocus
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <div className={styles.pwRow}>
                <input
                  className={styles.input}
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  required
                />
                <button type="button" className={styles.eyeBtn}
                  onClick={() => setShowPw(s => !s)}>
                  {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? <span className={styles.spinner}/> : 'Sign In'}
            </button>
            <Link to="/forgot-password" className={styles.forgotLink}>
              Forgot password?
            </Link>
            <div className={styles.hint}>
              Default credentials: <code>admin</code> / <code>admin123</code>
            </div>
          </form>
        )}

        {/* ── FORCE PASSWORD CHANGE ── */}
        {step === 'change-password' && (
          <form onSubmit={handleChangePassword} className={styles.form}>
            <div className={styles.alertBox}>
              <KeyRound size={16} color="var(--accent)"/>
              <div>
                <div className={styles.alertTitle}>Password change required</div>
                <div className={styles.alertDesc}>
                  You are using the default password. Please set a new secure password to continue.
                </div>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Current Password</label>
              <input
                className={styles.input}
                type="password"
                value={pwForm.currentPassword}
                onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                placeholder="admin123"
                autoFocus
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>New Password</label>
              <div className={styles.pwRow}>
                <input
                  className={styles.input}
                  type={showPw ? 'text' : 'password'}
                  value={pwForm.newPassword}
                  onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                  placeholder="Min. 8 characters"
                  required
                />
                <button type="button" className={styles.eyeBtn}
                  onClick={() => setShowPw(s => !s)}>
                  {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
              <PasswordStrength password={pwForm.newPassword}/>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Confirm New Password</label>
              <input
                className={styles.input}
                type="password"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="Re-enter new password"
                required
              />
            </div>

            {error   && <div className={styles.error}>{error}</div>}
            {success && (
              <div className={styles.successBox}>
                <ShieldCheck size={14}/> {success}
              </div>
            )}

            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? <span className={styles.spinner}/> : 'Set New Password & Sign In'}
            </button>
          </form>
        )}

        <div className={styles.footer}>Monarch Wireless · Nairobi</div>
      </div>
    </div>
  );
}

function PasswordStrength({ password }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#0dbb85'];

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