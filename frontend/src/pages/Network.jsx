import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi, WifiOff, Users, Activity, Cpu, HardDrive, RefreshCw, AlertCircle, Radio } from 'lucide-react';
import api from '../services/api';
import styles from './Network.module.css';

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
}

function UsageBar({ value, color = 'var(--accent)' }) {
  const pct = Math.min(100, Math.max(0, value || 0));
  const barColor = pct > 80 ? 'var(--red)' : pct > 60 ? 'var(--accent)' : color;
  return (
    <div className={styles.usageBar}>
      <div className={styles.usageFill} style={{ width: `${pct}%`, background: barColor }} />
    </div>
  );
}

function APCard({ ap }) {
  const navigate = useNavigate();
  const isOnline = ap.status === 'online';

  function goToClients() {
    navigate(`/network/clients?ap=${encodeURIComponent(ap.mac)}&name=${encodeURIComponent(ap.name)}`);
  }

  return (
    <div className={`${styles.apCard} ${isOnline ? styles.online : styles.offline}`}>
      <div className={styles.apHeader}>
        <div className={styles.apTitleRow}>
          <div className={`${styles.statusDot} ${isOnline ? styles.dotOnline : styles.dotOffline}`} />
          <div className={styles.apName}>{ap.name}</div>
        </div>
        <div className={`${styles.statusBadge} ${isOnline ? styles.badgeOnline : styles.badgeOffline}`}>
          {isOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
          {ap.status}
        </div>
      </div>

      <div className={styles.apMeta}>
        <span className={styles.metaChip}>{ap.model}</span>
        {ap.ip && ap.ip !== '—' && <span className={styles.metaChip}>{ap.ip}</span>}
        <span className={styles.metaChip}>{ap.mac}</span>
      </div>

      <div className={styles.apStats}>
        {/* Clickable clients stat */}
        <div
          className={`${styles.apStat} ${isOnline ? styles.apStatClickable : ''}`}
          onClick={isOnline ? goToClients : undefined}
          title={isOnline ? 'View connected devices' : ''}
        >
          <Users size={13} color="var(--cyan)" />
          <span className={styles.apStatVal}>{ap.connected_clients}</span>
          <span className={styles.apStatLbl}>
            {isOnline ? 'Clients ↗' : 'Clients'}
          </span>
        </div>

        <div className={styles.apStat}>
          <Activity size={13} color="var(--green)" />
          <span className={styles.apStatVal}>{ap.uptime_str || formatUptime(ap.uptime_seconds)}</span>
          <span className={styles.apStatLbl}>Uptime</span>
        </div>

        <div className={styles.apStat}>
          <Radio size={13} color="var(--accent)" />
          <span className={styles.apStatVal}>
            {[ap.channel_2g !== '—' && `2.4G:${ap.channel_2g}`, ap.channel_5g !== '—' && `5G:${ap.channel_5g}`]
              .filter(Boolean).join(' / ') || '—'}
          </span>
          <span className={styles.apStatLbl}>Channels</span>
        </div>
      </div>

      {isOnline && (
        <div className={styles.apTraffic}>
          <div className={styles.trafficRow}>
            <span className={styles.trafficLbl}>↑ TX</span>
            <span className={styles.trafficVal}>{formatBytes(ap.tx_bytes)}</span>
          </div>
          <div className={styles.trafficRow}>
            <span className={styles.trafficLbl}>↓ RX</span>
            <span className={styles.trafficVal}>{formatBytes(ap.rx_bytes)}</span>
          </div>
        </div>
      )}

      {isOnline && (ap.cpu_usage > 0 || ap.mem_usage > 0) && (
        <div className={styles.apResources}>
          <div className={styles.resourceRow}>
            <div className={styles.resourceLabel}>
              <Cpu size={10} /><span>CPU {ap.cpu_usage}%</span>
            </div>
            <UsageBar value={ap.cpu_usage} color="var(--cyan)" />
          </div>
          <div className={styles.resourceRow}>
            <div className={styles.resourceLabel}>
              <HardDrive size={10} /><span>MEM {ap.mem_usage}%</span>
            </div>
            <UsageBar value={ap.mem_usage} color="var(--green)" />
          </div>
        </div>
      )}

      {ap.firmware && ap.firmware !== '—' && (
        <div className={styles.apFirmware}>FW {ap.firmware}</div>
      )}
    </div>
  );
}

export default function Network() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get('/network/aps');
      setData(res.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to connect to Omada');
      if (err.response?.data?.aps) {
        setData({ aps: err.response.data.aps, summary: {}, from_cache: true });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  const summary = data?.summary || {};
  const aps = data?.aps || [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>AP Management</div>
          <h1 className={styles.headerTitle}>Network</h1>
        </div>
        <div className={styles.headerRight}>
          {lastRefresh && (
            <span className={styles.lastRefresh}>Updated {lastRefresh.toLocaleTimeString()}</span>
          )}
          <button className={`${styles.refreshBtn} ${refreshing ? styles.spinning : ''}`}
            onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <AlertCircle size={14} />
          <span>{error}</span>
          {data?.from_cache && <span className={styles.cacheNote}>— showing cached data</span>}
        </div>
      )}

      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryVal} style={{ color: 'var(--green)' }}>
            {summary.online ?? aps.filter(a => a.status === 'online').length}
          </div>
          <div className={styles.summaryLbl}>Online APs</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryVal} style={{ color: summary.offline > 0 ? 'var(--red)' : 'var(--text3)' }}>
            {summary.offline ?? aps.filter(a => a.status !== 'online').length}
          </div>
          <div className={styles.summaryLbl}>Offline APs</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryVal} style={{ color: 'var(--cyan)' }}>
            {summary.total_clients ?? aps.reduce((s, a) => s + (a.connected_clients || 0), 0)}
          </div>
          <div className={styles.summaryLbl}>Connected Clients</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryVal}>{summary.total ?? aps.length}</div>
          <div className={styles.summaryLbl}>Total APs</div>
        </div>
      </div>

      {aps.length === 0 ? (
        <div className={styles.empty}>
          <WifiOff size={32} color="var(--text3)" />
          <div>No access points found</div>
          <div className={styles.emptySub}>Make sure your EAP610 is adopted in Omada</div>
        </div>
      ) : (
        <div className={styles.apGrid}>
          {aps.map(ap => <APCard key={ap.id || ap.mac} ap={ap} />)}
        </div>
      )}
    </div>
  );
}