import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Wifi, ArrowLeft, RefreshCw, Download, Upload, Signal, Clock, Monitor, AlertCircle } from 'lucide-react';
import api from '../services/api';
import styles from './LiveClients.module.css';

function SignalBars({ rssi }) {
  if (!rssi) return <span style={{ color: 'var(--text3)' }}>—</span>;
  const abs = Math.abs(rssi);
  const quality = abs < 50 ? 'excellent' : abs < 65 ? 'good' : abs < 75 ? 'fair' : 'poor';
  const colors = { excellent: 'var(--green)', good: 'var(--cyan)', fair: 'var(--accent)', poor: 'var(--red)' };
  return (
    <span style={{ color: colors[quality], fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <Signal size={11} /> {rssi} dBm
    </span>
  );
}

export default function LiveClients() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const apMac = searchParams.get('ap');
  const apName = searchParams.get('name');

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
      const params = apMac ? `?ap=${encodeURIComponent(apMac)}` : '';
      const res = await api.get(`/network/clients${params}`);
      setData(res.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch connected clients');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apMac]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 20000);
    return () => clearInterval(interval);
  }, [load]);

  const clients = data?.clients || [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/network')}>
            <ArrowLeft size={14} /> Network
          </button>
          <div>
            <div className={styles.headerLabel}>Live Connected Devices</div>
            <h1 className={styles.headerTitle}>
              {apName || 'All Access Points'}
              {!loading && (
                <span className={styles.countBadge}>{clients.length} connected</span>
              )}
            </h1>
          </div>
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
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : clients.length === 0 ? (
        <div className={styles.empty}>
          <Wifi size={32} color="var(--text3)" strokeWidth={1.5} />
          <div>No clients currently connected</div>
          <div className={styles.emptySub}>Clients will appear here as they connect</div>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Device</th>
                <th>IP Address</th>
                <th>MAC Address</th>
                <th>Band / SSID</th>
                <th>Signal</th>
                <th>Connected</th>
                <th><Download size={11} /> Download</th>
                <th><Upload size={11} /> Upload</th>
                <th>TX Speed</th>
                <th>RX Speed</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => (
                <tr key={c.mac || i}>
                  <td>
                    <div className={styles.deviceCell}>
                      <div className={styles.deviceIcon}>
                        <Monitor size={13} color="var(--cyan)" />
                      </div>
                      <div>
                        <div className={styles.deviceName}>{c.name}</div>
                        {c.vendor && c.vendor !== '—' && (
                          <div className={styles.deviceVendor}>{c.vendor}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={styles.mono}>{c.ip}</td>
                  <td className={styles.mono}>{c.mac}</td>
                  <td>
                    <div className={styles.bandCell}>
                      {c.band !== '—' && (
                        <span className={styles.bandBadge}>{c.band}</span>
                      )}
                      <span className={styles.ssid}>{c.ssid}</span>
                    </div>
                  </td>
                  <td><SignalBars rssi={c.signal} /></td>
                  <td>
                    <div className={styles.timeCell}>
                      <Clock size={11} color="var(--text3)" />
                      <span className={styles.mono}>{c.connect_time_str}</span>
                    </div>
                  </td>
                  <td className={styles.mono}>{c.tx_bytes_fmt}</td>
                  <td className={styles.mono}>{c.rx_bytes_fmt}</td>
                  <td className={`${styles.mono} ${styles.speed}`}>{c.tx_rate_fmt}</td>
                  <td className={`${styles.mono} ${styles.speed}`}>{c.rx_rate_fmt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AP info footer */}
      {apMac && (
        <div className={styles.apFooter}>
          <Wifi size={12} color="var(--text3)" />
          <span>AP: {apName}</span>
          <span className={styles.dot}>·</span>
          <span className={styles.mono}>{apMac}</span>
        </div>
      )}
    </div>
  );
}
