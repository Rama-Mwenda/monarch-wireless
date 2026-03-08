import { useEffect, useState } from 'react';
import { Plus, Edit2, ToggleLeft, ToggleRight, Clock, Zap, Star } from 'lucide-react';
import api from '../services/api';
import styles from './Packages.module.css';

const EMPTY_FORM = {
  name: '', price: '', duration_minutes: '', loyalty_points: '',
  download_kbps: '', upload_kbps: '', data_cap_mb: '',
  is_promo: false, site_id: '',
};

function formatDuration(mins) {
  const m = parseInt(mins);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${m / 60} hr`;
  if (m < 10080) return `${m / 1440} day`;
  return `${(m / 10080).toFixed(0)} wk`;
}

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

export default function Packages({ readOnly = false }) {
  const [packages, setPackages] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [pkgRes, dashRes] = await Promise.all([
        api.get('/packages'),
        api.get('/dashboard'),
      ]);
      setPackages(pkgRes.data);
      setSites(dashRes.data.sites || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, site_id: sites[0]?.id || '' });
    setError('');
    setShowModal(true);
  }

  function openEdit(pkg) {
    setEditing(pkg);
    setForm({
      name: pkg.name, price: pkg.price,
      duration_minutes: pkg.duration_minutes,
      loyalty_points: pkg.loyalty_points,
      download_kbps: pkg.download_kbps || '',
      upload_kbps: pkg.upload_kbps || '',
      data_cap_mb: pkg.data_cap_mb || '',
      is_promo: !!pkg.is_promo,
      site_id: pkg.site_id,
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        price: parseFloat(form.price),
        duration_minutes: parseInt(form.duration_minutes),
        loyalty_points: parseInt(form.loyalty_points) || 0,
        download_kbps: form.download_kbps ? parseInt(form.download_kbps) : null,
        upload_kbps: form.upload_kbps ? parseInt(form.upload_kbps) : null,
        data_cap_mb: form.data_cap_mb ? parseInt(form.data_cap_mb) : null,
      };
      if (editing) {
        await api.patch(`/packages/${editing.id}`, payload);
      } else {
        await api.post('/packages', payload);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save package');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(pkg) {
    try {
      await api.patch(`/packages/${pkg.id}`, { is_active: pkg.is_active ? 0 : 1 });
      load();
    } catch (e) { console.error(e); }
  }

  const active = packages.filter(p => p.is_active);
  const inactive = packages.filter(p => !p.is_active);

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>Package Engine</div>
          <h1 className={styles.headerTitle}>Packages</h1>
        </div>
        <button className={styles.createBtn} onClick={openCreate}>
          <Plus size={16} /> New Package
        </button>
      </div>

      <div className={styles.sectionLabel}>Active — {active.length} packages</div>
      <div className={styles.grid}>
        {active.map(pkg => (
          <PackageCard key={pkg.id} pkg={pkg} onEdit={openEdit} onToggle={toggleActive} readOnly={readOnly} />
        ))}
        <button className={styles.addCard} onClick={openCreate}>
          <Plus size={24} strokeWidth={1.5} />
          {!readOnly && <span>Add Package</span>}
        </button>
      </div>

      {inactive.length > 0 && (
        <>
          <div className={styles.sectionLabel} style={{ marginTop: 32 }}>
            Inactive — {inactive.length} packages
          </div>
          <div className={styles.grid}>
            {inactive.map(pkg => (
              <PackageCard key={pkg.id} pkg={pkg} onEdit={openEdit} onToggle={toggleActive} readOnly={readOnly} />
            ))}
          </div>
        </>
      )}

      {showModal && !readOnly && (
        <Modal title={editing ? 'Edit Package' : 'New Package'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className={styles.form}>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.label}>Package Name</label>
                <input className={styles.input} value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Daily Rush" required />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Site</label>
                <select className={styles.input} value={form.site_id}
                  onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))} required>
                  <option value="">Select site</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.label}>Price (KES)</label>
                <input className={styles.input} type="number" min="1" step="0.5"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="30" required />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Duration (minutes)</label>
                <input className={styles.input} type="number" min="1"
                  value={form.duration_minutes}
                  onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                  placeholder="1440" required />
                {form.duration_minutes && (
                  <div className={styles.hint}>= {formatDuration(form.duration_minutes)}</div>
                )}
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.label}>Loyalty Points</label>
                <input className={styles.input} type="number" min="0"
                  value={form.loyalty_points}
                  onChange={e => setForm(f => ({ ...f, loyalty_points: e.target.value }))}
                  placeholder="3" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Data Cap (MB) — optional</label>
                <input className={styles.input} type="number" min="0"
                  value={form.data_cap_mb}
                  onChange={e => setForm(f => ({ ...f, data_cap_mb: e.target.value }))}
                  placeholder="Unlimited" />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.label}>Download Speed (Kbps)</label>
                <input className={styles.input} type="number" min="0"
                  value={form.download_kbps}
                  onChange={e => setForm(f => ({ ...f, download_kbps: e.target.value }))}
                  placeholder="Unlimited" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Upload Speed (Kbps)</label>
                <input className={styles.input} type="number" min="0"
                  value={form.upload_kbps}
                  onChange={e => setForm(f => ({ ...f, upload_kbps: e.target.value }))}
                  placeholder="Unlimited" />
              </div>
            </div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={form.is_promo}
                onChange={e => setForm(f => ({ ...f, is_promo: e.target.checked }))} />
              <span>Mark as promotional package</span>
            </label>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="submit" className={styles.saveBtn} disabled={saving}>
                {saving ? <span className={styles.spinner} /> : (editing ? 'Save Changes' : 'Create Package')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function PackageCard({ pkg, onEdit, onToggle, readOnly = false }) {
  return (
    <div className={`${styles.card} ${!pkg.is_active ? styles.inactive : ''}`}>
      {pkg.is_promo && <div className={styles.promoBadge}><Star size={10} /> PROMO</div>}
      <div className={styles.cardTop}>
        <div className={styles.cardName}>{pkg.name}</div>
        <div className={styles.cardPrice}>KES {pkg.price}</div>
      </div>
      <div className={styles.cardMeta}>
        <span className={styles.metaItem}><Clock size={11} /> {formatDuration(pkg.duration_minutes)}</span>
        {pkg.download_kbps && (
          <span className={styles.metaItem}><Zap size={11} /> {Math.round(pkg.download_kbps / 1000)} Mbps</span>
        )}
        <span className={styles.metaItem}><Star size={11} /> {pkg.loyalty_points} pts</span>
      </div>
      <div className={styles.cardSite}>{pkg.site_name}</div>
      <div className={styles.cardStats}>
        <span>{pkg.total_sessions || 0} sessions</span>
        <span>KES {(pkg.total_revenue || 0).toLocaleString()}</span>
      </div>
      <div className={styles.cardActions}>
        {!readOnly && (
          <button className={styles.editBtn} onClick={() => onEdit(pkg)}>
            <Edit2 size={13} /> Edit
          </button>
        )}
        <button className={styles.toggleBtn} onClick={() => onToggle(pkg)}>
          {pkg.is_active
            ? <><ToggleRight size={15} color="var(--green)" /> Active</>
            : <><ToggleLeft size={15} color="var(--text3)" /> Inactive</>}
        </button>
      </div>
    </div>
  );
}