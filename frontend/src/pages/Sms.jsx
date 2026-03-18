import { useEffect, useState } from 'react';
import { MessageSquare, Settings, Send, ToggleLeft, ToggleRight,
         Eye, EyeOff, CheckCircle, AlertCircle, ChevronDown,
         ChevronUp, Megaphone, Clock } from 'lucide-react';
import api from '../services/api';
import styles from './Sms.module.css';

const PLACEHOLDERS = [
  { key: '[[company]]',      desc: 'Your company name' },
  { key: '[[package]]',      desc: 'Package name' },
  { key: '[[duration]]',     desc: 'Duration (1hr, 1d…)' },
  { key: '[[expiry]]',       desc: 'Expiry time' },
  { key: '[[receipt]]',      desc: 'M-Pesa receipt' },
  { key: '[[minutes]]',      desc: 'Minutes remaining' },
  { key: '[[portal_url]]',   desc: 'Portal URL' },
  { key: '[[phone]]',        desc: 'Customer phone' },
  { key: '[[message]]',      desc: 'Custom message (broadcast)' },
];

function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      {type === 'success' ? <CheckCircle size={14}/> : <AlertCircle size={14}/>}
      {msg}
    </div>
  );
}

function ProviderCard({ provider, onSave }) {
  const [editing, setEditing]   = useState(false);
  const [token,   setToken]     = useState('');
  const [sender,  setSender]    = useState(provider.sender_id || '');
  const [active,  setActive]    = useState(!!provider.is_active);
  const [def,     setDef]       = useState(!!provider.is_default);
  const [showTok, setShowTok]   = useState(false);
  const [saving,  setSaving]    = useState(false);

  async function save() {
    setSaving(true);
    await onSave(provider.id, {
      api_token: token || provider.api_token,
      sender_id: sender,
      is_active: active,
      is_default: def,
    });
    setSaving(false);
    setEditing(false);
    setToken('');
  }

  return (
    <div className={`${styles.providerCard} ${provider.is_default ? styles.providerDefault : ''}`}>
      <div className={styles.providerHeader}>
        <div className={styles.providerInfo}>
          <div className={styles.providerName}>{provider.label}</div>
          <div className={styles.providerMeta}>
            {provider._has_token
              ? <span className={styles.badgeGreen}>Token configured</span>
              : <span className={styles.badgeRed}>No token</span>}
            {provider.is_default
              ? <span className={styles.badgeAccent}>Default</span>
              : null}
          </div>
        </div>
        <div className={styles.providerActions}>
          <button
            className={`${styles.toggleBtn} ${active ? styles.toggleOn : ''}`}
            onClick={() => setActive(a => !a)}
            title={active ? 'Disable' : 'Enable'}>
            {active ? <ToggleRight size={22} color="var(--green)"/> : <ToggleLeft size={22} color="var(--text3)"/>}
          </button>
          <button className={styles.editBtn} onClick={() => setEditing(e => !e)}>
            <Settings size={14}/> {editing ? 'Cancel' : 'Configure'}
          </button>
        </div>
      </div>

      {editing && (
        <div className={styles.providerForm}>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>API Token</label>
            <div className={styles.tokenRow}>
              <input
                className={styles.formInput}
                type={showTok ? 'text' : 'password'}
                placeholder={provider._has_token ? '••••••••  (leave blank to keep current)' : 'Paste your API token'}
                value={token}
                onChange={e => setToken(e.target.value)}
              />
              <button className={styles.eyeBtn} onClick={() => setShowTok(s => !s)}>
                {showTok ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Sender ID</label>
            <input
              className={styles.formInput}
              type="text"
              placeholder="e.g. MonarchWifi (max 11 chars)"
              maxLength={11}
              value={sender}
              onChange={e => setSender(e.target.value)}
            />
          </div>
          <div className={styles.formCheckRow}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={def} onChange={e => setDef(e.target.checked)}/>
              Set as default provider
            </label>
          </div>
          <button className={styles.saveBtn} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template, onSave }) {
  const [expanded, setExpanded] = useState(false);
  const [content,  setContent]  = useState(template.content);
  const [active,   setActive]   = useState(!!template.is_active);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  async function save() {
    setSaving(true);
    await onSave(template.id, { content, is_active: active });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleActive() {
    const next = !active;
    setActive(next);
    onSave(template.id, { content, is_active: next });
  }

  function insertPlaceholder(key) {
    setContent(c => c + key);
  }

  return (
    <div className={`${styles.templateCard} ${!active ? styles.templateInactive : ''}`}>
      <div className={styles.templateHeader} onClick={() => setExpanded(e => !e)}>
        <div className={styles.templateLeft}>
          <button
            className={styles.templateToggle}
            onClick={e => { e.stopPropagation(); toggleActive(); }}
            title={active ? 'Disable template' : 'Enable template'}>
            {active
              ? <ToggleRight size={20} color="var(--green)"/>
              : <ToggleLeft  size={20} color="var(--text3)"/>}
          </button>
          <div>
            <div className={styles.templateName}>{template.label}</div>
            <div className={styles.templateKey}>{template.name}</div>
          </div>
        </div>
        <div className={styles.templateRight}>
          {!active && <span className={styles.badgeOff}>OFF</span>}
          {expanded ? <ChevronUp size={16} color="var(--text3)"/> : <ChevronDown size={16} color="var(--text3)"/>}
        </div>
      </div>

      {expanded && (
        <div className={styles.templateBody}>
          <div className={styles.placeholderRow}>
            {PLACEHOLDERS.map(p => (
              <button key={p.key} className={styles.placeholderChip}
                onClick={() => insertPlaceholder(p.key)}
                title={p.desc}>
                {p.key}
              </button>
            ))}
          </div>
          <textarea
            className={styles.templateTextarea}
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            placeholder="SMS message content..."
          />
          <div className={styles.templateFooter}>
            <span className={styles.charCount}>
              {content.length} chars · ~{Math.ceil(content.length / 160)} SMS
            </span>
            <button className={styles.saveBtn} onClick={save} disabled={saving}>
              {saved ? <><CheckCircle size={12}/> Saved!</> : saving ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sms() {
  const [tab,        setTab]       = useState('templates');
  const [providers,  setProviders] = useState([]);
  const [templates,  setTemplates] = useState([]);
  const [logs,       setLogs]      = useState([]);
  const [toast,      setToast]     = useState(null);
  const [testPhone,  setTestPhone] = useState('');
  const [testing,    setTesting]   = useState(false);
  const [broadcast,  setBroadcast] = useState({ message: '', tier: '' });
  const [sending,    setSending]   = useState(false);

  async function loadAll() {
    try {
      const [p, t, l] = await Promise.all([
        api.get('/sms/providers'),
        api.get('/sms/templates'),
        api.get('/sms/log'),
      ]);
      setProviders(p.data.providers || []);
      setTemplates(t.data.templates || []);
      setLogs(l.data.logs || []);
    } catch { /* silent */ }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/set-state-in-effect

  async function saveProvider(id, data) {
    try {
      await api.put(`/sms/providers/${id}`, data);
      showToast('Provider saved!', 'success');
      loadAll();
    } catch { showToast('Save failed', 'error'); }
  }

  async function saveTemplate(id, data) {
    try {
      await api.put(`/sms/templates/${id}`, data);
      showToast('Template saved!', 'success');
    } catch { showToast('Save failed', 'error'); }
  }

  async function sendTest() {
    if (!testPhone) return;
    setTesting(true);
    try {
      const r = await api.post('/sms/test', { phone: testPhone });
      showToast(r.data.success ? 'Test SMS sent! ✅' : 'Send failed ❌', r.data.success ? 'success' : 'error');
    } catch { showToast('Test failed', 'error'); }
    setTesting(false);
  }

  async function sendBroadcast() {
    if (!broadcast.message) return;
    setSending(true);
    try {
      const r = await api.post('/sms/broadcast', broadcast);
      showToast(`Sent to ${r.data.sent} users ✅`, 'success');
      setBroadcast({ message: '', tier: '' });
      loadAll();
    } catch { showToast('Broadcast failed', 'error'); }
    setSending(false);
  }

  function showToast(msg, type) {
    setToast({ msg, type });
  }

  return (
    <div className={styles.page}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}

      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>Communications</div>
          <h1 className={styles.headerTitle}>SMS Manager</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div className={styles.tabs}>
        {[
          { key: 'templates', label: 'Templates',  icon: MessageSquare },
          { key: 'providers', label: 'Providers',  icon: Settings },
          { key: 'broadcast', label: 'Broadcast',  icon: Megaphone },
          { key: 'log',       label: 'SMS Log',    icon: Clock },
        ].map(({ key, label, icon }) => {
          const TabIcon = icon;
          return (
            <button key={key}
              className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
              onClick={() => setTab(key)}>
              <TabIcon size={14}/> {label}
            </button>
          );
        })}
      </div>

      {/* ── TEMPLATES TAB ── */}
      {tab === 'templates' && (
        <div className={styles.section}>
          <div className={styles.sectionDesc}>
            Toggle templates on/off and customise the message content. Click a placeholder chip to insert it into the template.
          </div>
          <div className={styles.templateList}>
            {templates.map(t => (
              <TemplateCard key={t.id} template={t} onSave={saveTemplate}/>
            ))}
          </div>
        </div>
      )}

      {/* ── PROVIDERS TAB ── */}
      {tab === 'providers' && (
        <div className={styles.section}>
          <div className={styles.sectionDesc}>
            Configure your SMS gateway. Only the default active provider will be used for sending.
            API tokens are masked after saving.
          </div>
          <div className={styles.providerList}>
            {providers.map(p => (
              <ProviderCard key={p.id} provider={p} onSave={saveProvider}/>
            ))}
          </div>

          {/* Test SMS */}
          <div className={styles.testCard}>
            <div className={styles.testTitle}><Send size={14}/> Send Test SMS</div>
            <div className={styles.testRow}>
              <input
                className={styles.formInput}
                type="tel"
                placeholder="Phone number e.g. 0712345678"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
              />
              <button className={styles.testBtn} onClick={sendTest} disabled={testing || !testPhone}>
                {testing ? 'Sending…' : 'Send Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BROADCAST TAB ── */}
      {tab === 'broadcast' && (
        <div className={styles.section}>
          <div className={styles.sectionDesc}>
            Send a custom SMS to all opted-in users. Optionally filter by tier.
          </div>
          <div className={styles.broadcastCard}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Filter by Tier (optional)</label>
              <select className={styles.formSelect}
                value={broadcast.tier}
                onChange={e => setBroadcast(b => ({ ...b, tier: e.target.value }))}>
                <option value="">All users</option>
                <option value="bronze">Bronze</option>
                <option value="silver">Silver</option>
                <option value="gold">Gold</option>
                <option value="platinum">Platinum</option>
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Message</label>
              <textarea
                className={styles.broadcastTextarea}
                placeholder="Type your broadcast message..."
                value={broadcast.message}
                onChange={e => setBroadcast(b => ({ ...b, message: e.target.value }))}
                rows={4}
              />
              <span className={styles.charCount}>{broadcast.message.length} chars</span>
            </div>
            <button className={styles.broadcastBtn}
              onClick={sendBroadcast}
              disabled={sending || !broadcast.message}>
              <Megaphone size={15}/>
              {sending ? 'Sending…' : 'Send Broadcast'}
            </button>
          </div>
        </div>
      )}

      {/* ── LOG TAB ── */}
      {tab === 'log' && (
        <div className={styles.section}>
          <div className={styles.logTable}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr><td colSpan={5} className={styles.empty}>No SMS sent yet</td></tr>
                )}
                {logs.map((l, i) => (
                  <tr key={i}>
                    <td className={styles.mono}>{l.phone}</td>
                    <td><span className={styles.typeChip}>{l.message_type}</span></td>
                    <td className={styles.msgCell}>{l.body}</td>
                    <td>
                      <span className={`${styles.statusChip} ${l.status === 'sent' ? styles.statusSent : styles.statusFailed}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className={styles.mono}>
                      {l.created_at ? new Date(l.created_at + 'Z').toLocaleString('en-KE', {
                        timeZone: 'Africa/Nairobi',
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit', hour12: false,
                      }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}