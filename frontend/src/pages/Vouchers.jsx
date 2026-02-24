import { useEffect, useState } from 'react';
import { Plus, Copy, Check, RefreshCw, Filter } from 'lucide-react';
import api from '../services/api';
import styles from './Vouchers.module.css';

function Modal({ title, onClose, children }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button className={styles.copyBtn} onClick={copy} title="Copy code">
      {copied ? <Check size={12} color="var(--green)" /> : <Copy size={12} />}
    </button>
  );
}

export default function Vouchers() {
  const [vouchers, setVouchers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showGenerated, setShowGenerated] = useState(null);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ package_id: '', quantity: 1, expires_at: '' });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [vRes, pRes] = await Promise.all([
        api.get('/vouchers'),
        api.get('/packages?active_only=true'),
      ]);
      setVouchers(vRes.data);
      setPackages(pRes.data);
      if (!form.package_id && pRes.data.length > 0) {
        setForm(f => ({ ...f, package_id: pRes.data[0].id }));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleGenerate(e) {
    e.preventDefault();
    setGenerating(true);
    setError('');
    try {
      const res = await api.post('/vouchers/generate', {
        package_id: form.package_id,
        quantity: parseInt(form.quantity),
        expires_at: form.expires_at || undefined,
      });
      setShowModal(false);
      setShowGenerated(res.data);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate vouchers');
    } finally {
      setGenerating(false);
    }
  }

  function copyAll(codes) {
    navigator.clipboard.writeText(codes.join('\n'));
  }

  const filtered = vouchers.filter(v => {
    if (filter === 'unused') return !v.is_used;
    if (filter === 'used') return v.is_used;
    return true;
  });

  const unusedCount = vouchers.filter(v => !v.is_used).length;
  const usedCount = vouchers.filter(v => v.is_used).length;

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>Voucher System</div>
          <h1 className={styles.headerTitle}>Vouchers</h1>
        </div>
        <button className={styles.createBtn} onClick={() => { setError(''); setShowModal(true); }}>
          <Plus size={16} /> Generate Vouchers
        </button>
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statBox}>
          <div className={styles.statVal}>{vouchers.length}</div>
          <div className={styles.statLbl}>Total</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statVal} style={{ color: 'var(--green)' }}>{unusedCount}</div>
          <div className={styles.statLbl}>Available</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statVal} style={{ color: 'var(--text3)' }}>{usedCount}</div>
          <div className={styles.statLbl}>Used</div>
        </div>
      </div>

      {/* Filter */}
      <div className={styles.filterRow}>
        <Filter size={13} color="var(--text3)" />
        {['all', 'unused', 'used'].map(f => (
          <button key={f} className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button className={styles.refreshBtn} onClick={load} title="Refresh">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Voucher table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Package</th>
              <th>Price</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Used By</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className={styles.empty}>No vouchers found</td></tr>
            ) : filtered.map(v => (
              <tr key={v.id} className={v.is_used ? styles.usedRow : ''}>
                <td>
                  <div className={styles.codeCell}>
                    <span className={styles.code}>{v.code}</span>
                    {!v.is_used && <CopyButton text={v.code} />}
                  </div>
                </td>
                <td>{v.package_name}</td>
                <td className={styles.mono}>KES {v.price}</td>
                <td className={styles.mono}>{formatDuration(v.duration_minutes)}</td>
                <td>
                  <span className={`${styles.badge} ${v.is_used ? styles.badgeUsed : styles.badgeAvail}`}>
                    {v.is_used ? 'Used' : 'Available'}
                  </span>
                </td>
                <td className={styles.mono}>{v.used_by_phone || '—'}</td>
                <td className={styles.mono}>{v.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Generate modal */}
      {showModal && (
        <Modal title="Generate Vouchers" onClose={() => setShowModal(false)}>
          <form onSubmit={handleGenerate} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Package</label>
              <select className={styles.input} value={form.package_id}
                onChange={e => setForm(f => ({ ...f, package_id: e.target.value }))} required>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — KES {p.price} ({formatDuration(p.duration_minutes)})
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Quantity (1–500)</label>
              <input className={styles.input} type="number" min="1" max="500"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Expiry Date — optional</label>
              <input className={styles.input} type="date"
                value={form.expires_at}
                onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className={styles.saveBtn} disabled={generating}>
                {generating ? <span className={styles.spinner} /> : `Generate ${form.quantity} Voucher${form.quantity > 1 ? 's' : ''}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Generated results modal */}
      {showGenerated && (
        <Modal title={`${showGenerated.vouchers.length} Vouchers Generated`} onClose={() => setShowGenerated(null)}>
          <div className={styles.generatedBody}>
            <div className={styles.generatedMeta}>
              Package: <strong>{showGenerated.package}</strong>
            </div>
            <div className={styles.codesGrid}>
              {showGenerated.vouchers.map(code => (
                <div key={code} className={styles.generatedCode}>
                  <span>{code}</span>
                  <CopyButton text={code} />
                </div>
              ))}
            </div>
            <button className={styles.copyAllBtn} onClick={() => copyAll(showGenerated.vouchers)}>
              <Copy size={14} /> Copy All Codes
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function formatDuration(mins) {
  const m = parseInt(mins);
  if (m < 60) return `${m}min`;
  if (m < 1440) return `${m / 60}hr`;
  if (m < 10080) return `${m / 1440}d`;
  return `${(m / 10080).toFixed(0)}wk`;
}
