import { useEffect, useState } from 'react';
import { Search, Star, Clock, Plus, RefreshCw, ChevronRight, X } from 'lucide-react';
import api from '../services/api';
import styles from './Users.module.css';

const TIER_COLORS = { platinum: '#e2e8f0', gold: '#f0a500', silver: '#8a9bb5', bronze: '#cd7c3a' };
const TIERS = ['all', 'bronze', 'silver', 'gold', 'platinum'];

function Modal({ title, onClose, children }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState(30);
  const [addPoints, setAddPoints] = useState(5);
  const [actionMsg, setActionMsg] = useState('');
  const [punchTarget, setPunchTarget] = useState(6);
  const [punchTargetInput, setPunchTargetInput] = useState(6);
  const [punchTargetSaving, setPunchTargetSaving] = useState(false);
  const [punchTargetMsg, setPunchTargetMsg] = useState('');

  useEffect(() => {
    api.get('/settings').then(r => {
      const t = r.data.punch_target || 6;
      setPunchTarget(t);
      setPunchTargetInput(t);
    }).catch(() => {});
  }, []);

  async function savePunchTarget() {
    setPunchTargetSaving(true);
    setPunchTargetMsg('');
    try {
      await api.put('/settings', { punch_target: punchTargetInput });
      setPunchTarget(punchTargetInput);
      setPunchTargetMsg('✓ Saved');
      setTimeout(() => setPunchTargetMsg(''), 2000);
    } catch {
      setPunchTargetMsg('✗ Failed to save');
    }
    setPunchTargetSaving(false);
  }

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 100 });
      if (search) params.set('search', search);
      if (tierFilter !== 'all') params.set('tier', tierFilter);
      const res = await api.get(`/users?${params}`);
      setUsers(res.data.users);
      setTotal(res.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [tierFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e) {
    e.preventDefault();
    load();
  }

  async function openUser(user) {
    setSelectedUser(user);
    setDetailLoading(true);
    setActionMsg('');
    try {
      const res = await api.get(`/users/${user.id}`);
      setUserDetail(res.data);
    } catch (e) { console.error(e); }
    finally { setDetailLoading(false); }
  }

  function closeUser() {
    setSelectedUser(null);
    setUserDetail(null);
    setActionMsg('');
  }

  async function handleExtend() {
    try {
      await api.post(`/users/${selectedUser.id}/extend-session`, { minutes: parseInt(extendMinutes) });
      setActionMsg(`✓ Session extended by ${extendMinutes} minutes`);
    } catch (err) {
      setActionMsg(`✗ ${err.response?.data?.error || 'Failed to extend session'}`);
    }
  }

  async function handleAddPoints() {
    try {
      await api.post(`/users/${selectedUser.id}/add-points`, { points: parseInt(addPoints) });
      setActionMsg(`✓ Added ${addPoints} loyalty points`);
      const res = await api.get(`/users/${selectedUser.id}`);
      setUserDetail(res.data);
      load();
    } catch (err) {
      setActionMsg(`✗ ${err.response?.data?.error || 'Failed to add points'}`);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>User Management</div>
          <h1 className={styles.headerTitle}>Users</h1>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.totalBadge}>{total} total</span>
          <button className={styles.refreshBtn} onClick={load}><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Search + filters */}
      <div className={styles.controls}>
        <form onSubmit={handleSearch} className={styles.searchForm}>
          <Search size={14} color="var(--text3)" />
          <input className={styles.searchInput} placeholder="Search by phone or name..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button type="button" onClick={() => { setSearch(''); setTimeout(load, 0); }}>
              <X size={13} color="var(--text3)" />
            </button>
          )}
        </form>
        <div className={styles.tierFilters}>
          {TIERS.map(t => (
            <button key={t} className={`${styles.tierBtn} ${tierFilter === t ? styles.tierActive : ''}`}
              onClick={() => setTierFilter(t)}
              style={tierFilter === t && t !== 'all' ? { borderColor: TIER_COLORS[t], color: TIER_COLORS[t] } : {}}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Punch card target setting */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        marginBottom: 12,
        width: 'fit-content',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: 1 }}>
          🎯 PUNCH TARGET
        </span>
        <input
          type="number" min="1" max="100"
          value={punchTargetInput}
          onChange={e => setPunchTargetInput(parseInt(e.target.value) || 1)}
          style={{
            width: 52, padding: '4px 8px', borderRadius: 6,
            background: 'var(--surface2)', border: '1px solid var(--border2)',
            color: 'var(--text)', fontSize: 13, textAlign: 'center',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>sessions</span>
        <button
          onClick={savePunchTarget}
          disabled={punchTargetSaving || punchTargetInput === punchTarget}
          style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: 'var(--accent)', color: '#000', border: 'none',
            cursor: punchTargetSaving || punchTargetInput === punchTarget ? 'not-allowed' : 'pointer',
            opacity: punchTargetSaving || punchTargetInput === punchTarget ? 0.5 : 1,
          }}>
          {punchTargetSaving ? 'Saving…' : 'Save'}
        </button>
        {punchTargetMsg && (
          <span style={{ fontSize: 12, color: punchTargetMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
            {punchTargetMsg}
          </span>
        )}
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Phone</th>
              <th>Tier</th>
              <th>Total Spent</th>
              <th>Sessions</th>
              <th>Points</th>
              <th>Punch Card</th>
              <th>Last Seen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className={styles.empty}><div className={styles.spinner} /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={8} className={styles.empty}>No users found</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className={styles.userRow} onClick={() => openUser(u)}>
                <td>
                  <div className={styles.phone}>{u.phone}</div>
                  {u.name && <div className={styles.name}>{u.name}</div>}
                </td>
                <td>
                  <span className={styles.tier} style={{ color: TIER_COLORS[u.tier] }}>
                    {u.tier}
                  </span>
                </td>
                <td className={styles.mono}>KES {u.total_spent?.toLocaleString()}</td>
                <td className={styles.mono}>{u.total_sessions}</td>
                <td>
                  <span className={styles.points}><Star size={10} /> {u.loyalty_points}</span>
                </td>
                <td>
                  <div className={styles.punchRow}>
                    {Array.from({ length: punchTarget }).map((_, i) => (
                      <div key={i} className={`${styles.punch} ${i < (u.punch_count % punchTarget) ? styles.punchFilled : ''}`} />
                    ))}
                  </div>
                </td>
                <td className={styles.mono}>{u.last_seen ? u.last_seen.slice(0, 10) : '—'}</td>
                <td><ChevronRight size={14} color="var(--text3)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User detail modal */}
      {selectedUser && (
        <Modal title={`User ${selectedUser.phone}`} onClose={closeUser}>
          <div className={styles.detailBody}>
            {detailLoading ? (
              <div className={styles.detailLoading}><div className={styles.spinner} /></div>
            ) : userDetail ? (
              <>
                {/* User stats */}
                <div className={styles.detailStats}>
                  <div className={styles.dStat}>
                    <div className={styles.dStatVal} style={{ color: TIER_COLORS[userDetail.tier] }}>
                      {userDetail.tier}
                    </div>
                    <div className={styles.dStatLbl}>Tier</div>
                  </div>
                  <div className={styles.dStat}>
                    <div className={styles.dStatVal}>KES {userDetail.total_spent?.toLocaleString()}</div>
                    <div className={styles.dStatLbl}>Total Spent</div>
                  </div>
                  <div className={styles.dStat}>
                    <div className={styles.dStatVal}>{userDetail.loyalty_points}</div>
                    <div className={styles.dStatLbl}>Points</div>
                  </div>
                  <div className={styles.dStat}>
                    <div className={styles.dStatVal}>{userDetail.total_sessions}</div>
                    <div className={styles.dStatLbl}>Sessions</div>
                  </div>
                </div>

                {/* Punch card */}
                <div className={styles.detailSection}>
                  <div className={styles.detailSectionTitle}>Punch Card ({userDetail.punch_count % punchTarget}/{punchTarget})</div>
                  <div className={styles.punchRowLarge}>
                    {Array.from({ length: punchTarget }).map((_, i) => (
                      <div key={i} className={`${styles.punchLarge} ${i < (userDetail.punch_count % punchTarget) ? styles.punchFilled : ''}`} />
                    ))}
                  </div>
                </div>

                {/* Admin actions */}
                <div className={styles.detailSection}>
                  <div className={styles.detailSectionTitle}>Admin Actions</div>
                  <div className={styles.actionRow}>
                    <div className={styles.actionLabel}><Clock size={12} /> Extend Session</div>
                    <div className={styles.actionInputRow}>
                      <input className={styles.actionInput} type="number" min="1" value={extendMinutes}
                        onChange={e => setExtendMinutes(e.target.value)} />
                      <span className={styles.actionUnit}>minutes</span>
                      <button className={styles.actionBtn} onClick={handleExtend}>Extend</button>
                    </div>
                  </div>
                  <div className={styles.actionRow}>
                    <div className={styles.actionLabel}><Star size={12} /> Add Loyalty Points</div>
                    <div className={styles.actionInputRow}>
                      <input className={styles.actionInput} type="number" min="1" value={addPoints}
                        onChange={e => setAddPoints(e.target.value)} />
                      <span className={styles.actionUnit}>points</span>
                      <button className={styles.actionBtn} onClick={handleAddPoints}>Add</button>
                    </div>
                  </div>
                  {actionMsg && (
                    <div className={`${styles.actionMsg} ${actionMsg.startsWith('✓') ? styles.msgOk : styles.msgErr}`}>
                      {actionMsg}
                    </div>
                  )}
                </div>

                {/* Session history */}
                <div className={styles.detailSection}>
                  <div className={styles.detailSectionTitle}>Session History</div>
                  {userDetail.sessions?.length === 0 ? (
                    <div className={styles.empty}>No sessions yet</div>
                  ) : (
                    <div className={styles.sessionList}>
                      {userDetail.sessions?.slice(0, 10).map(s => (
                        <div key={s.id} className={styles.sessionRow}>
                          <div>
                            <div className={styles.sessionPkg}>{s.package_name}</div>
                            <div className={styles.sessionDate}>{s.start_at?.slice(0, 16).replace('T', ' ')}</div>
                          </div>
                          <div className={styles.sessionRight}>
                            <span className={`${styles.sessionStatus} ${styles[s.status]}`}>{s.status}</span>
                            <span className={styles.sessionAmt}>KES {s.amount_paid}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </Modal>
      )}
    </div>
  );
}