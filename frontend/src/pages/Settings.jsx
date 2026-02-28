import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, UserPlus, Trash2, KeyRound,
         Eye, EyeOff, CheckCircle, AlertCircle, CreditCard,
         Wifi, FlaskConical } from 'lucide-react';
import api from '../services/api';
import styles from './Settings.module.css';

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      {type === 'success' ? <CheckCircle size={14}/> : <AlertCircle size={14}/>}
      {msg}
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
  const colors = ['','#ef4444','#f97316','#eab308','#22c55e','#0dbb85'];
  const labels = ['','Weak','Fair','Good','Strong','Very Strong'];
  return (
    <div style={{marginTop:6}}>
      <div style={{display:'flex',gap:3,marginBottom:4}}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{height:3,flex:1,borderRadius:2,
            background: i<=score ? colors[score] : 'var(--border)',transition:'background 0.2s'}}/>
        ))}
      </div>
      <div style={{fontSize:10,color:colors[score],fontFamily:'var(--font-mono)'}}>{labels[score]}</div>
    </div>
  );
}

export default function Settings() {
  const { admin } = useAuth();
  const [admins,  setAdmins]  = useState([]);
  const [toast,   setToast]   = useState(null);
  const [tab,     setTab]     = useState('password');

  // Change password form
  const [pwForm,  setPwForm]  = useState({ currentPassword:'', newPassword:'', confirm:'' });
  const [showPw,  setShowPw]  = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  // Create admin form
  const [newAdmin, setNewAdmin] = useState({ username:'', email:'', password:'', role:'viewer' });
  const [creating, setCreating] = useState(false);

  const isSuperAdmin = admin?.role === 'super_admin';

  // Payment config state
  const [payConfig,    setPayConfig]    = useState([]);
  const [payEdits,     setPayEdits]     = useState({});
  const [paySaving,    setPaySaving]    = useState(false);
  const [payTesting,   setPayTesting]   = useState(false);
  const [showSecrets,  setShowSecrets]  = useState({});

  const loadPaymentConfig = () => {
    api.get('/payment/config')
      .then(res => {
        setPayConfig(res.data.config || []);
        // Populate edits with current values
        const edits = {};
        (res.data.config || []).forEach(c => { edits[c.key] = c.value || ''; });
        setPayEdits(edits);
      })
      .catch(console.error);
  };

  const loadAdmins = () => {
    api.get('/auth/admins')
      .then(res => setAdmins(res.data))
      .catch(console.error);
  };

  useEffect(() => {
    if (isSuperAdmin) {
      loadAdmins();
      loadPaymentConfig();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleChangePassword(e) {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm)
      return showToast('Passwords do not match', 'error');
    if (pwForm.newPassword.length < 8)
      return showToast('Password must be at least 8 characters', 'error');

    setPwSaving(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword:     pwForm.newPassword,
      });
      setPwForm({ currentPassword:'', newPassword:'', confirm:'' });
      showToast('Password updated successfully ✅', 'success');
    } catch(e) {
      showToast(e.response?.data?.error || 'Failed to update password', 'error');
    }
    setPwSaving(false);
  }

  async function handleCreateAdmin(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/auth/create-admin', newAdmin);
      setNewAdmin({ username:'', email:'', password:'', role:'viewer' });
      showToast(`Admin "${newAdmin.username}" created ✅`, 'success');
      loadAdmins();
    } catch(e) {
      showToast(e.response?.data?.error || 'Failed to create admin', 'error');
    }
    setCreating(false);
  }

  async function handleDeleteAdmin(id, username) {
    if (!confirm(`Delete admin "${username}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/auth/admins/${id}`);
      showToast(`Admin "${username}" deleted`, 'success');
      loadAdmins();
    } catch(e) {
      showToast(e.response?.data?.error || 'Delete failed', 'error');
    }
  }

  async function handleSavePayment() {
    setPaySaving(true);
    try {
      const updates = Object.entries(payEdits).map(([key, value]) => ({ key, value }));
      await api.put('/payment/config', { updates });
      showToast('M-Pesa config saved ✅', 'success');
      loadPaymentConfig();
    } catch(e) {
      showToast(e.response?.data?.error || 'Failed to save config', 'error');
    }
    setPaySaving(false);
  }

  async function handleTestConnection() {
    setPayTesting(true);
    try {
      // Save first so test uses latest values
      const updates = Object.entries(payEdits).map(([key, value]) => ({ key, value }));
      await api.put('/payment/config', { updates });
      const res = await api.post('/payment/test-connection');
      showToast(res.data.message, 'success');
    } catch(e) {
      showToast(e.response?.data?.error || 'Connection test failed', 'error');
    }
    setPayTesting(false);
  }

  function showToast(msg, type) { setToast({ msg, type }); }

  const tabs = [
    { key: 'password', label: 'Change Password', icon: KeyRound },
    ...(isSuperAdmin ? [{ key: 'admins',  label: 'Admin Accounts', icon: ShieldCheck }] : []),
    ...(isSuperAdmin ? [{ key: 'payment', label: 'M-Pesa Config',  icon: CreditCard  }] : []),
  ];

  return (
    <div className={styles.page}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}

      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>System</div>
          <h1 className={styles.headerTitle}>Settings</h1>
        </div>
      </div>

      <div className={styles.tabs}>
        {tabs.map(({ key, label, icon }) => (
          <button key={key}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
            onClick={() => setTab(key)}>
            {React.createElement(icon, { size: 14 })} {label}
          </button>
        ))}
      </div>

      {/* ── CHANGE PASSWORD ── */}
      {tab === 'password' && (
        <div className={styles.section}>
          <div className={styles.sectionDesc}>
            Update your login password. Use a strong password with a mix of letters, numbers and symbols.
          </div>
          <div className={styles.formCard}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Current Password</label>
              <input
                className={styles.formInput}
                type="password"
                value={pwForm.currentPassword}
                onChange={e => setPwForm(f => ({...f, currentPassword: e.target.value}))}
                placeholder="Your current password"
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>New Password</label>
              <div className={styles.pwRow}>
                <input
                  className={styles.formInput}
                  type={showPw ? 'text' : 'password'}
                  value={pwForm.newPassword}
                  onChange={e => setPwForm(f => ({...f, newPassword: e.target.value}))}
                  placeholder="Min. 8 characters"
                />
                <button type="button" className={styles.eyeBtn}
                  onClick={() => setShowPw(s => !s)}>
                  {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
              <PasswordStrength password={pwForm.newPassword}/>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Confirm New Password</label>
              <input
                className={styles.formInput}
                type="password"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({...f, confirm: e.target.value}))}
                placeholder="Re-enter new password"
              />
            </div>
            <button className={styles.saveBtn} onClick={handleChangePassword} disabled={pwSaving}>
              <KeyRound size={13}/>
              {pwSaving ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </div>
      )}

      {/* ── M-PESA CONFIG ── */}
      {tab === 'payment' && isSuperAdmin && (
        <div className={styles.section}>
          <div className={styles.sectionDesc}>
            Configure M-Pesa Daraja API credentials. Changes take effect immediately — no restart required.
          </div>

          <div className={styles.formCard}>
            <div className={styles.cardTitle}><CreditCard size={14}/> M-Pesa Daraja API</div>

            {/* Environment toggle */}
            {payConfig.filter(c => c.key === 'mpesa_env').map(c => (
              <div key={c.key} className={styles.formRow}>
                <label className={styles.formLabel}>{c.label}</label>
                <select
                  className={styles.formSelect}
                  value={payEdits[c.key] || 'sandbox'}
                  onChange={e => setPayEdits(f => ({...f, [c.key]: e.target.value}))}>
                  <option value="sandbox">Sandbox (testing)</option>
                  <option value="production">Production (live)</option>
                </select>
                <div className={styles.fieldDesc}>{c.description}</div>
              </div>
            ))}

            {/* Shortcode + Callback URL — not secret */}
            <div className={styles.twoCol}>
              {payConfig.filter(c => ['mpesa_shortcode','mpesa_callback_url'].includes(c.key)).map(c => (
                <div key={c.key} className={styles.formRow}>
                  <label className={styles.formLabel}>{c.label}</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    value={payEdits[c.key] || ''}
                    onChange={e => setPayEdits(f => ({...f, [c.key]: e.target.value}))}
                    placeholder={c.description}
                  />
                  <div className={styles.fieldDesc}>{c.description}</div>
                </div>
              ))}
            </div>

            {/* Secret fields — Consumer Key, Secret, Passkey */}
            {payConfig.filter(c => c.is_secret && c.key !== 'mpesa_env').map(c => (
              <div key={c.key} className={styles.formRow}>
                <label className={styles.formLabel}>{c.label}</label>
                <div className={styles.pwRow}>
                  <input
                    className={styles.formInput}
                    type={showSecrets[c.key] ? 'text' : 'password'}
                    value={payEdits[c.key] || ''}
                    onChange={e => setPayEdits(f => ({...f, [c.key]: e.target.value}))}
                    placeholder={c._has_value ? 'Leave blank to keep existing' : c.description}
                  />
                  <button type="button" className={styles.eyeBtn}
                    onClick={() => setShowSecrets(s => ({...s, [c.key]: !s[c.key]}))}>
                    {showSecrets[c.key] ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
                <div className={styles.fieldDesc}>{c.description}</div>
              </div>
            ))}

            <div className={styles.btnRow}>
              <button className={styles.testBtn} onClick={handleTestConnection} disabled={payTesting}>
                <FlaskConical size={13}/>
                {payTesting ? 'Testing…' : 'Test Connection'}
              </button>
              <button className={styles.saveBtn} onClick={handleSavePayment} disabled={paySaving}>
                <CreditCard size={13}/>
                {paySaving ? 'Saving…' : 'Save Config'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADMIN ACCOUNTS ── */}
      {tab === 'admins' && isSuperAdmin && (
        <div className={styles.section}>
          <div className={styles.sectionDesc}>
            Manage admin accounts. Only super admins can create or delete accounts.
          </div>

          {/* Create new admin */}
          <div className={styles.formCard}>
            <div className={styles.cardTitle}><UserPlus size={14}/> Create Admin Account</div>
            <div className={styles.twoCol}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Username</label>
                <input className={styles.formInput} type="text"
                  value={newAdmin.username}
                  onChange={e => setNewAdmin(f => ({...f, username: e.target.value}))}
                  placeholder="e.g. john"/>
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Email</label>
                <input className={styles.formInput} type="email"
                  value={newAdmin.email}
                  onChange={e => setNewAdmin(f => ({...f, email: e.target.value}))}
                  placeholder="john@example.com"/>
              </div>
            </div>
            <div className={styles.twoCol}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Password</label>
                <input className={styles.formInput} type="password"
                  value={newAdmin.password}
                  onChange={e => setNewAdmin(f => ({...f, password: e.target.value}))}
                  placeholder="Min. 8 characters"/>
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Role</label>
                <select className={styles.formSelect}
                  value={newAdmin.role}
                  onChange={e => setNewAdmin(f => ({...f, role: e.target.value}))}>
                  <option value="viewer">Viewer — read only</option>
                  <option value="site_manager">Site Manager — manage packages & vouchers</option>
                  <option value="super_admin">Super Admin — full access</option>
                </select>
              </div>
            </div>
            <button className={styles.saveBtn} onClick={handleCreateAdmin} disabled={creating}>
              <UserPlus size={13}/>
              {creating ? 'Creating…' : 'Create Account'}
            </button>
          </div>

          {/* Existing admins */}
          <div className={styles.adminList}>
            {admins.map(a => (
              <div key={a.id} className={`${styles.adminRow} ${a.id === admin.id ? styles.adminSelf : ''}`}>
                <div className={styles.adminAvatar}>
                  {a.username[0].toUpperCase()}
                </div>
                <div className={styles.adminInfo}>
                  <div className={styles.adminName}>
                    {a.username}
                    {a.id === admin.id && <span className={styles.youBadge}>You</span>}
                  </div>
                  <div className={styles.adminEmail}>{a.email}</div>
                </div>
                <div className={styles.adminMeta}>
                  <span className={`${styles.roleBadge} ${styles['role_' + a.role]}`}>
                    {a.role.replace('_', ' ')}
                  </span>
                  <div className={styles.adminLastLogin}>
                    {a.last_login ? `Last login: ${a.last_login.slice(0,16)}` : 'Never logged in'}
                  </div>
                </div>
                {a.id !== admin.id && (
                  <button className={styles.deleteAdminBtn}
                    onClick={() => handleDeleteAdmin(a.id, a.username)}
                    title="Delete admin">
                    <Trash2 size={14}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}