import { useEffect, useState } from 'react';
import { Wifi, TrendingUp, CreditCard, ChevronRight, Users, Phone } from 'lucide-react';
import MpesaPayModal from '../components/MpesaPayModal';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import styles from './HostDashboard.module.css';

function StatCard({ label, value, sub, icon, color }) {
  const Icon = icon;
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ background: `${color}18`, color }}>
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <div className={styles.statBody}>
        <div className={styles.statValue}>{value}</div>
        <div className={styles.statLabel}>{label}</div>
        {sub && <div className={styles.statSub}>{sub}</div>}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{label}</div>
      <div className={styles.tooltipVal}>KES {payload[0]?.value?.toLocaleString()}</div>
      <div className={styles.tooltipSub}>Your share: KES {payload[1]?.value?.toLocaleString()}</div>
    </div>
  );
}

export default function HostDashboard() {
  const [showPayModal, setShowPayModal] = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [selAP,   setSelAP]   = useState(null);
  const [apData,  setApData]  = useState(null);

  // Derive loading state — avoids calling setState synchronously inside an effect
  const apLoading = Boolean(selAP && apData?.ap?.mac !== selAP);

  useEffect(() => {
    api.get('/hosts/dashboard')
      .then(r => {
        setData(r.data);
        if (r.data.aps?.length === 1) setSelAP(r.data.aps[0].mac);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selAP) return;
    let cancelled = false;
    api.get(`/hosts/revenue/${selAP}`)
      .then(r => { if (!cancelled) setApData(r.data); })
      .catch(e => { if (!cancelled) console.error(e); });
    return () => { cancelled = true; };
  }, [selAP]);

  if (loading) return (
    <div className={styles.loading}><div className={styles.spinner} /></div>
  );

  if (!data) return (
    <div className={styles.loading}>Failed to load. Ensure you have been assigned an access point.</div>
  );

  const chartData = apData?.monthly_breakdown?.slice().reverse().map(m => ({
    month: m.month,
    gross: m.gross,
    share: m.host_share,
  })) || [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>Host Portal</div>
          <h1 className={styles.headerTitle}>My Revenue</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowPayModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '7px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '13px', cursor: 'pointer', letterSpacing: '0.3px' }}
          >
            <Phone size={14} /> Collect Payment
          </button>
          <div className={styles.liveIndicator}>
            <span className={styles.liveDot} />
            Live
          </div>
        </div>
      </div>

      {/* Summary KPI cards */}
      <div className={styles.statsGrid}>
        <StatCard
          label="My Share Today"
          value={`KES ${data.total_today_share.toLocaleString()}`}
          sub={`KES ${data.total_today_gross.toLocaleString()} gross`}
          icon={CreditCard}
          color="var(--accent)"
        />
        <StatCard
          label="My Share This Month"
          value={`KES ${data.total_month_share.toLocaleString()}`}
          sub={`KES ${data.total_month_gross.toLocaleString()} gross`}
          icon={TrendingUp}
          color="var(--green)"
        />
        <StatCard
          label="Access Points"
          value={data.aps.length}
          sub={`${data.aps.filter(a => a.status === 'online').length} online`}
          icon={Wifi}
          color="var(--cyan)"
        />
        <StatCard
          label="Active Sessions"
          value={data.aps.reduce((s, a) => s + (a.connected_clients || 0), 0)}
          sub="Currently connected"
          icon={Users}
          color="#8b5cf6"
        />
      </div>

      <div className={styles.bodyRow}>
        {/* AP list */}
        <div className={styles.apList}>
          <div className={styles.cardTitle}>My Access Points</div>
          {data.aps.length === 0 && (
            <div className={styles.empty}>No access points assigned yet</div>
          )}
          {data.aps.map(ap => (
            <div
              key={ap.mac}
              className={`${styles.apRow} ${selAP === ap.mac ? styles.apRowActive : ''}`}
              onClick={() => setSelAP(ap.mac)}
            >
              <div className={styles.apRowLeft}>
                <div className={`${styles.apDot} ${ap.status === 'online' ? styles.apDotOnline : ''}`} />
                <div>
                  <div className={styles.apName}>{ap.name || ap.mac}</div>
                  <div className={styles.apMac}>{ap.mac}</div>
                </div>
              </div>
              <div className={styles.apRowRight}>
                <div className={styles.apShare}>KES {ap.month_host_share.toLocaleString()}</div>
                <div className={styles.apShareLabel}>{ap.revenue_share_pct}% share</div>
                <ChevronRight size={14} color="var(--text3)" />
              </div>
            </div>
          ))}
        </div>

        {/* AP detail */}
        {selAP && (
          <div className={styles.apDetail}>
            {apLoading ? (
              <div className={styles.loading}><div className={styles.spinner} /></div>
            ) : apData ? (
              <>
                <div className={styles.cardTitle}>
                  {apData.ap?.name || selAP} — Revenue Detail
                </div>

                {/* Share breakdown */}
                <div className={styles.shareBreakdown}>
                  <div className={styles.shareRow}>
                    <span className={styles.shareKey}>Month Gross</span>
                    <span className={styles.shareVal}>KES {apData.month_gross.toLocaleString()}</span>
                  </div>
                  <div className={styles.shareRow}>
                    <span className={styles.shareKey}>Your Share ({apData.revenue_share_pct}%)</span>
                    <span className={styles.shareVal} style={{ color: 'var(--accent)' }}>
                      KES {apData.month_host_share.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.shareRow}>
                    <span className={styles.shareKey}>Today Gross</span>
                    <span className={styles.shareVal}>KES {apData.today_gross.toLocaleString()}</span>
                  </div>
                  <div className={styles.shareRow}>
                    <span className={styles.shareKey}>Today Your Share</span>
                    <span className={styles.shareVal} style={{ color: 'var(--green)' }}>
                      KES {apData.today_host_share.toLocaleString()}
                    </span>
                  </div>
                  <div className={`${styles.shareRow} ${styles.shareRowTotal}`}>
                    <span className={styles.shareKey}>All-Time Your Share</span>
                    <span className={styles.shareVal}>KES {apData.alltime_host_share.toLocaleString()}</span>
                  </div>
                </div>

                {/* Monthly chart */}
                {chartData.length > 0 && (
                  <div className={styles.chartWrap}>
                    <div className={styles.chartLabel}>Last 6 Months</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                        <XAxis dataKey="month" tick={{ fill: 'var(--text3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis hide />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="gross" fill="var(--surface3)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="share" fill="var(--accent)"   radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Package breakdown */}
                {apData.package_breakdown?.length > 0 && (
                  <div className={styles.pkgBreakdown}>
                    <div className={styles.chartLabel}>This Month by Package</div>
                    {apData.package_breakdown.map((p, i) => {
                      const total = apData.month_gross || 1;
                      const pct   = Math.round((p.revenue / total) * 100);
                      return (
                        <div key={i} className={styles.pkgRow}>
                          <div className={styles.pkgTop}>
                            <span className={styles.pkgName}>{p.name}</span>
                            <span className={styles.pkgSessions}>{p.sessions} sessions</span>
                          </div>
                          <div className={styles.pkgBar}>
                            <div className={styles.pkgFill} style={{ width: `${pct}%` }} />
                          </div>
                          <div className={styles.pkgStats}>
                            <span>KES {p.revenue.toLocaleString()}</span>
                            <span className={styles.pkgPct}>{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Recent transactions */}
                <div className={styles.chartLabel} style={{ marginTop: 16 }}>Recent Transactions</div>
                {apData.recent_sessions?.length === 0 && (
                  <div className={styles.empty}>No transactions yet</div>
                )}
                <div className={styles.txList}>
                  {(apData.recent_sessions || []).slice(0, 10).map((s, i) => (
                    <div key={i} className={styles.txRow}>
                      <span className={styles.txPhone}>{s.phone}</span>
                      <span className={styles.txPkg}>{s.package_name}</span>
                      <span className={styles.txAmt}>KES {s.amount_paid}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {showPayModal && <MpesaPayModal onClose={() => setShowPayModal(false)} />}
    </div>
  );
}