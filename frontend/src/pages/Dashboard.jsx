import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Wifi, CreditCard, Activity, Star } from 'lucide-react';
import api from '../services/api';
import styles from './Dashboard.module.css';
import MpesaButton from '../components/MpesaButton';
import { useAuth } from '../context/AuthContext';

const TIER_COLORS = {
  platinum: '#e2e8f0',
  gold: '#f0a500',
  silver: '#8a9bb5',
  bronze: '#cd7c3a',
};

function StatCard({ label, value, sub, icon, color, delay = 0 }) {
  const Icon = icon;
  return (
    <div className={styles.statCard} style={{ animationDelay: `${delay}ms` }}>
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
      <div className={styles.tooltipSub}>{payload[1]?.value} sessions</div>
    </div>
  );
}

export default function Dashboard() {
  const { admin } = useAuth();
  const canCollect = admin?.role === 'super_admin' || admin?.role === 'site_manager';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard')
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
    </div>
  );

  if (!data) return <div className={styles.loading}>Failed to load dashboard</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>Overview</div>
          <h1 className={styles.headerTitle}>Network Dashboard</h1>
        </div>
        <div className={styles.headerMeta}>
          <div className={styles.liveIndicator}>
            <span className={styles.liveDot} />
            Live
          </div>
          {canCollect && <MpesaButton label="Collect Payment" />}
        </div>
      </div>

      {/* KPI Cards */}
      <div className={styles.statsGrid}>
        <StatCard
          label="Revenue Today"
          value={`KES ${(data.revenue_today || 0).toLocaleString()}`}
          sub={`KES ${(data.revenue_month || 0).toLocaleString()} this month`}
          icon={CreditCard}
          color="var(--accent)"
          delay={0}
        />
        <StatCard
          label="Active Sessions"
          value={data.active_sessions || 0}
          sub={`${data.sessions_today || 0} sessions today`}
          icon={Activity}
          color="var(--green)"
          delay={50}
        />
        <StatCard
          label="Total Users"
          value={(data.total_users || 0).toLocaleString()}
          sub={`+${data.new_users_month || 0} this month`}
          icon={Users}
          color="var(--cyan)"
          delay={100}
        />
        <StatCard
          label="All-Time Revenue"
          value={`KES ${(data.revenue_alltime || 0).toLocaleString()}`}
          sub="Since launch"
          icon={TrendingUp}
          color="#8b5cf6"
          delay={150}
        />
      </div>

      <div className={styles.chartsRow}>
        {/* Revenue Chart */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}>Revenue — Last 30 Days</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.daily_revenue || []} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: 'var(--text3)', fontSize: 10, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} fill="url(#revGrad)" />
              <Area type="monotone" dataKey="sessions" stroke="transparent" fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Package Breakdown */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}>Package Breakdown</div>
          </div>
          {(data.package_breakdown || []).length === 0 ? (
            <div className={styles.empty}>No sessions yet</div>
          ) : (
            <div className={styles.packageList}>
              {(data.package_breakdown || []).map((pkg, i) => {
                const total = data.package_breakdown.reduce((s, p) => s + p.revenue, 0);
                const pct = total > 0 ? Math.round((pkg.revenue / total) * 100) : 0;
                return (
                  <div key={i} className={styles.packageRow}>
                    <div className={styles.packageName}>{pkg.name}</div>
                    <div className={styles.packageBar}>
                      <div className={styles.packageFill} style={{ width: `${pct}%` }} />
                    </div>
                    <div className={styles.packageStats}>
                      <span>KES {pkg.revenue.toLocaleString()}</span>
                      <span className={styles.packagePct}>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className={styles.bottomRow}>
        {/* Top Users */}
        <div className={styles.tableCard}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}>Top Users This Month</div>
            <Star size={14} color="var(--accent)" />
          </div>
          {(data.top_users || []).length === 0 ? (
            <div className={styles.empty}>No activity this month</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Tier</th>
                  <th>Sessions</th>
                  <th>Spend</th>
                </tr>
              </thead>
              <tbody>
                {(data.top_users || []).map((u, i) => (
                  <tr key={i}>
                    <td className="mono">{u.phone}</td>
                    <td>
                      <span className={styles.tier} style={{ color: TIER_COLORS[u.tier] }}>
                        {u.tier}
                      </span>
                    </td>
                    <td>{u.month_sessions}</td>
                    <td className={styles.amount}>KES {u.month_spend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Transactions */}
        <div className={styles.tableCard}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}>Recent Transactions</div>
            <Activity size={14} color="var(--text3)" />
          </div>
          {(data.recent_sessions || []).length === 0 ? (
            <div className={styles.empty}>No transactions yet</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Package</th>
                  <th>Method</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(data.recent_sessions || []).map((s, i) => (
                  <tr key={i}>
                    <td className="mono">{s.phone}</td>
                    <td>{s.package_name}</td>
                    <td>
                      <span className={`${styles.method} ${styles[s.payment_method]}`}>
                        {s.payment_method}
                      </span>
                    </td>
                    <td className={styles.amount}>KES {s.amount_paid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Sites */}
      {(data.sites || []).length > 0 && (
        <div className={styles.sitesRow}>
          {data.sites.map(site => (
            <div key={site.id} className={styles.siteCard}>
              <div className={styles.siteStatus}>
                <Wifi size={14} color={site.ap_online > 0 ? 'var(--green)' : 'var(--text3)'} />
                <span className={styles.siteName}>{site.name}</span>
              </div>
              <div className={styles.siteStats}>
                <span>{site.ap_online}/{site.ap_count} APs online</span>
                <span className={styles.amount}>KES {site.month_revenue?.toLocaleString()} this month</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}