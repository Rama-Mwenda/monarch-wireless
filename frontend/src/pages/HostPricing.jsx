import { useEffect, useState } from 'react';
import { Package, Save, RotateCcw, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';
import styles from './HostPricing.module.css';

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      {type === 'success' ? <CheckCircle size={14}/> : <AlertCircle size={14}/>}
      {msg}
    </div>
  );
}

export default function HostPricing() {
  const [aps,      setAps]      = useState([]);
  const [selAP,    setSelAP]    = useState(null);
  const [packages, setPackages] = useState([]);
  const [edits,    setEdits]    = useState({});
  const [saving,   setSaving]   = useState({});
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);

  useEffect(() => {
    api.get('/hosts/my-aps')
      .then(r => {
        setAps(r.data.aps || []);
        if (r.data.aps?.length === 1) setSelAP(r.data.aps[0].mac);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selAP) return;
    api.get(`/hosts/packages/${selAP}`)
      .then(r => {
        setPackages(r.data.packages || []);
        // Initialise edits with current effective prices
        const init = {};
        r.data.packages.forEach(p => {
          init[p.id] = p.has_override ? String(p.effective_price) : '';
        });
        setEdits(init);
      })
      .catch(console.error);
  }, [selAP]);

  async function handleSave(pkg) {
    setSaving(s => ({ ...s, [pkg.id]: true }));
    try {
      const val = edits[pkg.id];
      const price = val === '' ? null : parseFloat(val);

      if (price !== null && (isNaN(price) || price < 0))
        throw new Error('Invalid price');
      if (price !== null && price < pkg.system_price)
        throw new Error(`Price cannot be below system price of KES ${pkg.system_price}`);

      await api.put(`/hosts/packages/${selAP}`, {
        package_id: pkg.id,
        price,
      });

      // Refresh packages
      const r = await api.get(`/hosts/packages/${selAP}`);
      setPackages(r.data.packages || []);
      setToast({ msg: price === null ? `${pkg.name} reset to system price ✅` : `${pkg.name} price updated ✅`, type: 'success' });
    } catch(e) {
      setToast({ msg: e.response?.data?.error || e.message || 'Failed to save', type: 'error' });
    }
    setSaving(s => ({ ...s, [pkg.id]: false }));
  }

  if (loading) return (
    <div className={styles.loading}><div className={styles.spinner} /></div>
  );

  return (
    <div className={styles.page}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>Host Portal</div>
          <h1 className={styles.headerTitle}>Package Pricing</h1>
        </div>
      </div>

      <div className={styles.desc}>
        Override package prices for your access point. You may set prices above the system default — not below. Leave blank to use the system default.
      </div>

      {/* AP selector */}
      {aps.length > 1 && (
        <div className={styles.apTabs}>
          {aps.map(ap => (
            <button
              key={ap.mac}
              className={`${styles.apTab} ${selAP === ap.mac ? styles.apTabActive : ''}`}
              onClick={() => setSelAP(ap.mac)}
            >
              <span className={`${styles.apDot} ${ap.status === 'online' ? styles.apDotOnline : ''}`} />
              {ap.name || ap.mac}
            </button>
          ))}
        </div>
      )}

      {!selAP && (
        <div className={styles.empty}>No access points assigned to your account yet.</div>
      )}

      {selAP && packages.length === 0 && (
        <div className={styles.empty}>No packages found.</div>
      )}

      {selAP && packages.length > 0 && (
        <div className={styles.packageGrid}>
          {packages.map(pkg => (
            <div key={pkg.id} className={`${styles.pkgCard} ${pkg.has_override ? styles.pkgOverride : ''}`}>
              <div className={styles.pkgHeader}>
                <div className={styles.pkgIcon}>
                  <Package size={16} color={pkg.has_override ? 'var(--accent)' : 'var(--text3)'} />
                </div>
                <div className={styles.pkgInfo}>
                  <div className={styles.pkgName}>{pkg.name}</div>
                  <div className={styles.pkgDuration}>
                    {pkg.duration_minutes >= 1440
                      ? `${pkg.duration_minutes / 1440}d`
                      : pkg.duration_minutes >= 60
                      ? `${pkg.duration_minutes / 60}h`
                      : `${pkg.duration_minutes}min`}
                  </div>
                </div>
                {pkg.has_override && (
                  <span className={styles.overrideBadge}>Custom</span>
                )}
              </div>

              <div className={styles.priceRow}>
                <div className={styles.systemPrice}>
                  <span className={styles.priceLabel}>System price</span>
                  <span className={styles.priceVal}>KES {pkg.system_price}</span>
                </div>
                <div className={styles.arrowSep}>→</div>
                <div className={styles.overridePrice}>
                  <span className={styles.priceLabel}>Your price</span>
                  <div className={styles.priceInputRow}>
                    <span className={styles.pricePrefix}>KES</span>
                    <input
                      className={styles.priceInput}
                      type="number"
                      min={pkg.system_price}
                      value={edits[pkg.id] ?? ''}
                      onChange={e => setEdits(v => ({ ...v, [pkg.id]: e.target.value }))}
                      placeholder={String(pkg.system_price)}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.pkgActions}>
                {pkg.has_override && (
                  <button
                    className={styles.resetBtn}
                    onClick={() => {
                      setEdits(v => ({ ...v, [pkg.id]: '' }));
                      handleSave({ ...pkg, _reset: true });
                    }}
                    disabled={saving[pkg.id]}
                    title="Reset to system price"
                  >
                    <RotateCcw size={12}/> Reset
                  </button>
                )}
                <button
                  className={styles.saveBtn}
                  onClick={() => handleSave(pkg)}
                  disabled={saving[pkg.id]}
                >
                  <Save size={12}/> {saving[pkg.id] ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}