import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, UserPlus, Trash2, KeyRound,
         Eye, EyeOff, CheckCircle, AlertCircle, CreditCard,
         Wifi, FlaskConical, Mail, Send, ToggleLeft, ToggleRight,
         Settings as SettingsIcon, Link, Unlink, Percent } from 'lucide-react';
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


// ── Payment Provider Card component ──────────────────────────
function PaymentProviderCard({ provider, saving, onSave }) {
  const [editing,   setEditing]  = useState(false);
  const [isDefault, setDefault]  = useState(!!provider.is_default);
  const [cfg,       setCfg]      = useState(provider.config || {});
  const [showSecrets, setShow]   = useState({});
  const [testing,   setTesting]  = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, msg }

  const fields = provider.name === 'mpesa' ? [
    { key: 'env',            label: 'Environment',      secret: false, placeholder: 'sandbox or production', type: 'env' },
    { key: 'consumerKey',    label: 'Consumer Key',     secret: false, placeholder: 'Daraja consumer key' },
    { key: 'consumerSecret', label: 'Consumer Secret',  secret: true,  placeholder: 'Daraja consumer secret' },
    { key: 'shortcode',      label: 'Shortcode',        secret: false, placeholder: '174379' },
    { key: 'passkey',        label: 'Passkey',          secret: true,  placeholder: 'Daraja passkey' },
    { key: 'callbackUrl',    label: 'Callback URL',     secret: false, placeholder: 'https://yourdomain.com/api/mpesa/callback' },
  ] : [
    { key: 'env',          label: 'Environment',    secret: false, placeholder: 'sandbox or production', type: 'env' },
    { key: 'clientId',     label: 'Client ID',      secret: false, placeholder: 'K2 client ID' },
    { key: 'clientSecret', label: 'Client Secret',  secret: true,  placeholder: 'K2 client secret' },
    { key: 'apiKey',       label: 'API Key',        secret: true,  placeholder: 'K2 API key' },
    { key: 'tillNumber',   label: 'Till Number',    secret: false, placeholder: 'Your till number' },
    { key: 'callbackUrl',  label: 'Callback URL',   secret: false, placeholder: 'https://yourdomain.com/api/mpesa/k2-callback' },
  ];

  function handleSave() {
    onSave({ is_default: isDefault, config: cfg });
    setEditing(false);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      // Save config first so test uses latest values
      await onSave({ is_default: isDefault, config: cfg });
      const endpoint = provider.name === 'mpesa'
        ? '/payment/test-connection'
        : '/payment/test-k2-connection';
      const res = await import('../services/api').then(m => m.default.post(endpoint));
      setTestResult({ ok: true, msg: res.data.message || 'Connection successful ✅' });
    } catch(e) {
      setTestResult({ ok: false, msg: e.response?.data?.error || 'Connection test failed' });
    }
    setTesting(false);
  }

  return (
    <div className={`${styles.formCard} ${provider.is_default ? styles.providerDefault : ''}`}
         style={{ borderColor: provider.is_default ? 'var(--accent)' : undefined }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: provider.is_default ? 'rgba(240,165,0,0.15)' : 'var(--surface2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${provider.is_default ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`,
          }}>
            <CreditCard size={18} color={provider.is_default ? 'var(--accent)' : 'var(--text3)'} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {provider.label}
              {provider.is_default && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                  background: 'rgba(240,165,0,0.15)', color: 'var(--accent)',
                  border: '1px solid rgba(240,165,0,0.3)', borderRadius: 20, padding: '2px 8px',
                }}>ACTIVE</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{provider.description}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => { setDefault(true); onSave({ is_default: true, config: cfg }); }}
            disabled={provider.is_default || saving}
            style={{
              background: provider.is_default ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
              border: `1px solid ${provider.is_default ? 'var(--accent)' : 'var(--border)'}`,
              color: provider.is_default ? 'var(--accent)' : 'var(--text2)',
              borderRadius: 6, padding: '6px 14px', fontSize: 12,
              fontFamily: 'var(--font-mono)', cursor: provider.is_default ? 'default' : 'pointer',
            }}>
            {provider.is_default ? '✓ Default' : 'Set as Default'}
          </button>
          <button
            className={styles.editBtn || ''}
            onClick={() => setEditing(e => !e)}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text2)', padding: '6px 14px',
              fontSize: 12, fontFamily: 'var(--font-mono)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <SettingsIcon size={12} /> {editing ? 'Cancel' : 'Configure'}
          </button>
        </div>
      </div>

      {/* Config fields */}
      {editing && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className={styles.twoCol}>
            {fields.map(f => (
              <div key={f.key} className={styles.formRow}>
                <label className={styles.formLabel}>{f.label}</label>
                {f.type === 'env' ? (
                  <select
                    className={styles.formSelect}
                    value={cfg[f.key] || 'sandbox'}
                    onChange={e => setCfg(c => ({ ...c, [f.key]: e.target.value }))}>
                    <option value="sandbox">Sandbox (testing)</option>
                    <option value="production">Production (live)</option>
                  </select>
                ) : (
                  <div className={styles.pwRow}>
                    <input
                      className={styles.formInput}
                      type={f.secret && !showSecrets[f.key] ? 'password' : 'text'}
                      value={cfg[f.key] || ''}
                      onChange={e => setCfg(c => ({ ...c, [f.key]: e.target.value }))}
                      placeholder={cfg[f.key]?.startsWith('••••') ? 'Leave blank to keep current' : f.placeholder}
                    />
                    {f.secret && (
                      <button type="button" className={styles.eyeBtn}
                        onClick={() => setShow(s => ({ ...s, [f.key]: !s[f.key] }))}>
                        {showSecrets[f.key] ? <EyeOff size={14}/> : <Eye size={14}/>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className={styles.btnRow}>
            <button className={styles.testBtn} onClick={handleTest} disabled={testing || saving}>
              <FlaskConical size={13}/> {testing ? 'Testing…' : 'Test Connection'}
            </button>
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              <CreditCard size={13}/> {saving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
          {testResult && (
            <div style={{
              padding: '10px 14px', borderRadius: 6, fontSize: 12,
              background: testResult.ok ? 'rgba(13,187,133,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${testResult.ok ? 'rgba(13,187,133,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: testResult.ok ? 'var(--green)' : 'var(--red)',
              fontFamily: 'var(--font-mono)',
            }}>
              {testResult.msg}
            </div>
          )}
        </div>
      )}

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

  // Host assignments state
  const [allAPs,       setAllAPs]       = useState([]);
  const [siteManagers, setSiteManagers] = useState([]);
  const [assignments,  setAssignments]  = useState([]);
  const [assignAP,     setAssignAP]     = useState('');
  const [assignAdmin,  setAssignAdmin]  = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [shareEdits,   setShareEdits]   = useState({});

  // Payment providers state
  const [payProviders,    setPayProviders]    = useState([]);
  const [savingProvider,  setSavingProvider]  = useState(null);

  // SMTP config state
  const [smtpConfig,   setSmtpConfig]   = useState([]);
  const [smtpEdits,    setSmtpEdits]    = useState({});
  const [smtpSaving,   setSmtpSaving]   = useState(false);
  const [smtpTesting,  setSmtpTesting]  = useState(false);
  const [testEmail,    setTestEmail]    = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  const loadPayProviders = () => {
    api.get('/payment/providers')
      .then(res => setPayProviders(res.data.providers || []))
      .catch(console.error);
  };

  const loadSmtpConfig = () => {
    api.get('/payment/config')
      .then(res => {
        const all  = res.data.config || [];
        const smtp = all.filter(c => c.key.startsWith('smtp_'));
        setSmtpConfig(smtp);
        const edits = {};
        smtp.forEach(c => { edits[c.key] = c.value || ''; });
        setSmtpEdits(edits);
      })
      .catch(console.error);
  };

  const loadAdmins = () => {
    api.get('/auth/admins')
      .then(res => setAdmins(Array.isArray(res.data) ? res.data : (res.data.admins || [])))
      .catch(console.error);
  };

  const loadHosts = () => {
    api.get('/hosts/assignments').then(r => setAssignments(r.data.assignments || [])).catch(console.error);
    // Use DB APs (always populated) instead of live Omada fetch
    api.get('/hosts/my-aps').then(r => setAllAPs(r.data.aps || [])).catch(console.error);
    // /auth/admins returns a plain array (not {admins:[]})
    api.get('/auth/admins').then(r => {
      const list = Array.isArray(r.data) ? r.data : (r.data.admins || []);
      setSiteManagers(list.filter(a => a.role === 'site_manager'));
    }).catch(console.error);
  };

  useEffect(() => {
    if (isSuperAdmin) {
      loadAdmins();
      loadPayProviders();
      loadSmtpConfig();
      loadHosts();
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

  async function saveProvider(id, updates) {
    setSavingProvider(id);
    try {
      await api.put(`/payment/providers/${id}`, updates);
      showToast('Payment provider updated ✅', 'success');
      loadPayProviders();
    } catch(e) {
      showToast(e.response?.data?.error || 'Failed to update provider', 'error');
    }
    setSavingProvider(null);
  }

  async function handleSaveSmtp() {
    setSmtpSaving(true);
    try {
      const updates = Object.entries(smtpEdits).map(([key, value]) => ({ key, value }));
      await api.put('/payment/config', { updates });
      showToast('Email config saved ✅', 'success');
      loadSmtpConfig();
    } catch(e) {
      showToast(e.response?.data?.error || 'Failed to save SMTP config', 'error');
    }
    setSmtpSaving(false);
  }

  async function handleTestEmail() {
    if (!testEmail) return showToast('Enter a test email address', 'error');
    setSmtpTesting(true);
    try {
      const updates = Object.entries(smtpEdits).map(([key, value]) => ({ key, value }));
      await api.put('/payment/config', { updates });
      await api.post('/auth/test-email', { to: testEmail });
      showToast(`Test email sent to ${testEmail} ✅`, 'success');
    } catch(e) {
      showToast(e.response?.data?.error || 'Test email failed', 'error');
    }
    setSmtpTesting(false);
  }

  async function handleAssign() {
    if (!assignAP || !assignAdmin) return;
    setAssignSaving(true);
    try {
      await api.post('/hosts/assignments', { admin_id: assignAdmin, ap_mac: assignAP });
      showToast('Assignment saved ✅', 'success');
      loadHosts();
      setAssignAP(''); setAssignAdmin('');
    } catch(e) {
      showToast(e.response?.data?.error || 'Failed to assign', 'error');
    }
    setAssignSaving(false);
  }

  async function handleUnassign(adminId, apMac) {
    try {
      await api.delete('/hosts/assignments', { data: { admin_id: adminId, ap_mac: apMac } });
      showToast('Assignment removed', 'success');
      loadHosts();
    } catch {
      showToast('Failed to remove assignment', 'error');
    }
  }

  async function handleShareSave(mac) {
    const pct = parseFloat(shareEdits[mac]);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      showToast('Share must be between 0 and 100', 'error'); return;
    }
    try {
      await api.put(`/hosts/ap/${mac}`, { revenue_share_pct: pct });
      showToast('Revenue share updated ✅', 'success');
      loadHosts();
    } catch {
      showToast('Failed to update share', 'error');
    }
  }

  function showToast(msg, type) { setToast({ msg, type }); }

  const tabs = [
    { key: 'password', label: 'Change Password', icon: KeyRound },
    ...(isSuperAdmin ? [{ key: 'admins',  label: 'Admin Accounts', icon: ShieldCheck }] : []),
    ...(isSuperAdmin ? [{ key: 'providers', label: 'Payment Gateways', icon: CreditCard }] : []),
    ...(isSuperAdmin ? [{ key: 'email',   label: 'Email Config',   icon: Mail        }] : []),
    ...(isSuperAdmin ? [{ key: 'hosts',   label: 'Host Assignments', icon: Link        }] : []),
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


      {/* ── PAYMENT PROVIDERS ── */}
      {tab === 'providers' && isSuperAdmin && (
        <div className={styles.section}>
          <div className={styles.sectionDesc}>
            Choose which payment gateway guests use on the captive portal.
            Set one as <strong>Default</strong> — the portal will use that gateway for all STK Push payments.
          </div>

          <div className={styles.adminList}>
            {payProviders.map(p => (
              <PaymentProviderCard
                key={p.id}
                provider={p}
                saving={savingProvider === p.id}
                onSave={(updates) => saveProvider(p.id, updates)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── EMAIL CONFIG ── */}
      {tab === 'email' && isSuperAdmin && (
        <div className={styles.section}>
          <div className={styles.sectionDesc}>
            Configure SMTP email for password reset links. Gmail recommended — use an App Password, not your account password.
          </div>
          <div className={styles.formCard}>
            <div className={styles.cardTitle}><Mail size={14}/> SMTP Email Settings</div>

            <div className={styles.twoCol}>
              {smtpConfig.filter(c => ['smtp_host','smtp_port','smtp_user','smtp_from'].includes(c.key)).map(c => (
                <div key={c.key} className={styles.formRow}>
                  <label className={styles.formLabel}>{c.label}</label>
                  <input className={styles.formInput} type="text"
                    value={smtpEdits[c.key] || ''}
                    onChange={e => setSmtpEdits(f => ({...f, [c.key]: e.target.value}))}
                    placeholder={c.description}/>
                  <div className={styles.fieldDesc}>{c.description}</div>
                </div>
              ))}
            </div>

            {smtpConfig.filter(c => c.key === 'smtp_pass').map(c => (
              <div key={c.key} className={styles.formRow}>
                <label className={styles.formLabel}>{c.label}</label>
                <div className={styles.pwRow}>
                  <input className={styles.formInput}
                    type={showSmtpPass ? 'text' : 'password'}
                    value={smtpEdits[c.key] || ''}
                    onChange={e => setSmtpEdits(f => ({...f, [c.key]: e.target.value}))}
                    placeholder={c._has_value ? 'Leave blank to keep existing' : c.description}/>
                  <button type="button" className={styles.eyeBtn}
                    onClick={() => setShowSmtpPass(s => !s)}>
                    {showSmtpPass ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
                <div className={styles.fieldDesc}>{c.description}</div>
              </div>
            ))}

            <div className={styles.formRow}>
              <label className={styles.formLabel}>Send Test Email To</label>
              <div className={styles.pwRow}>
                <input className={styles.formInput} type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="your@email.com"/>
                <button className={styles.testBtn} onClick={handleTestEmail} disabled={smtpTesting}>
                  <Send size={13}/> {smtpTesting ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>

            <button className={styles.saveBtn} onClick={handleSaveSmtp} disabled={smtpSaving}>
              <Mail size={13}/> {smtpSaving ? 'Saving…' : 'Save Email Config'}
            </button>
          </div>

          <div className={styles.formCard} style={{marginTop: 16}}>
            <div className={styles.cardTitle}><Mail size={14}/> Gmail Quick Setup</div>
            <div className={styles.sectionDesc} style={{marginTop: 8}}>
              For Gmail: enable 2FA on your Google account, then go to Google Account → Security → App Passwords → create one for "Mail". Use that 16-character code as your SMTP Password.
            </div>
            <div style={{marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4}}>
              {[
                ['SMTP Host', 'smtp.gmail.com'],
                ['SMTP Port', '587'],
                ['SMTP Username', 'your.email@gmail.com'],
                ['SMTP Password', '16-character App Password'],
              ].map(([k, v]) => (
                <div key={k} style={{display:'flex', gap: 12, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)'}}>
                  <span style={{color:'var(--text2)', width: 140, flexShrink: 0}}>{k}</span>
                  <span style={{fontFamily:'var(--font-mono)', color:'var(--text)'}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── M-PESA CONFIG ── */}


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

      {tab === 'hosts' && isSuperAdmin && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Assign Hosts to Access Points</div>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20 }}>
            Link site_manager accounts to specific APs. Each host sees only their assigned APs and revenue.
          </p>

          {/* New assignment */}
          <div className={styles.formCard}>
            <div className={styles.twoCol}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Access Point</label>
                <select className={styles.formSelect} value={assignAP} onChange={e => setAssignAP(e.target.value)}>
                  <option value="">Select AP…</option>
                  {allAPs.map(ap => (
                    <option key={ap.mac} value={ap.mac}>{ap.name || ap.mac} ({ap.mac})</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Host Admin</label>
                <select className={styles.formSelect} value={assignAdmin} onChange={e => setAssignAdmin(e.target.value)}>
                  <option value="">Select host admin…</option>
                  {siteManagers.map(a => (
                    <option key={a.id} value={a.id}>{a.username} ({a.email})</option>
                  ))}
                </select>
              </div>
            </div>
            <button className={styles.saveBtn} onClick={handleAssign} disabled={assignSaving || !assignAP || !assignAdmin}>
              <Link size={13}/> {assignSaving ? 'Saving…' : 'Assign Host'}
            </button>
          </div>

          {/* Current assignments */}
          <div className={styles.sectionTitle} style={{ marginTop: 24 }}>Current Assignments</div>
          {assignments.length === 0 && (
            <p style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>No assignments yet.</p>
          )}
          {assignments.map((a, i) => (
            <div key={i} className={styles.adminRow} style={{ alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{a.username}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
                  {a.ap_name || a.ap_mac} · {a.ap_mac}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Percent size={12} color="var(--text3)"/>
                <input
                  className={styles.formInput}
                  style={{ width: 60, textAlign: 'center', padding: '4px 8px' }}
                  type="number" min="0" max="100"
                  defaultValue={a.revenue_share_pct ?? 70}
                  onChange={e => setShareEdits(s => ({ ...s, [a.ap_mac]: e.target.value }))}
                />
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>% host share</span>
                <button
                  onClick={() => handleShareSave(a.ap_mac)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text2)', padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                  Save
                </button>
              </div>
              <button className={styles.deleteAdminBtn} onClick={() => handleUnassign(a.admin_id, a.ap_mac)} title="Remove">
                <Unlink size={13}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}