import { useEffect, useState } from 'react';
import { Calendar, Printer, TrendingUp, CreditCard, Wifi, BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import styles from './HostReports.module.css';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(n) { return Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 }); }

function StatCard({ label, value, sub, color, icon }) {
  const Icon = icon;
  return (
    <div className={styles.statCard}>
      <div className={styles.statTop}>
        <div className={styles.statIcon} style={{ background: `${color}15`, color }}>
          <Icon size={16} strokeWidth={1.8} />
        </div>
      </div>
      <div className={styles.statVal}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      <div className={styles.tooltipVal}>Gross: KES {fmt(payload[0]?.value)}</div>
      <div className={styles.tooltipSub}>Your share: KES {fmt(payload[1]?.value)}</div>
    </div>
  );
}

export default function HostReports() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());
  const [aps,     setAps]     = useState([]);
  const [selAP,   setSelAP]   = useState(null);
  const [apData,  setApData]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [apLoading, setApLoading] = useState(false);

  // Load AP list once
  useEffect(() => {
    api.get('/hosts/my-aps')
      .then(r => {
        const list = r.data.aps || [];
        setAps(list);
        if (list.length === 1) setSelAP(list[0].mac);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Load AP revenue whenever AP or month changes
  useEffect(() => {
    if (!selAP) return;

    let cancelled = false;

    const monthStart = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    const lastDay    = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const monthEnd   = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    async function fetchRevenue() {
      setApLoading(true);
      try {
        const r = await api.get(`/hosts/revenue/${selAP}`, { params: { month_start: monthStart, month_end: monthEnd } });
        if (!cancelled) setApData(r.data);
      } catch (e) {
        if (!cancelled) console.error(e);
      } finally {
        if (!cancelled) setApLoading(false);
      }
    }

    fetchRevenue();
    return () => { cancelled = true; };
  }, [selAP, selectedMonth, selectedYear]);

  const monthLabel = `${MONTHS[selectedMonth]} ${selectedYear}`;

  // ── Print handler ────────────────────────────────────────────
  function handlePrint() {
    if (!apData) return;
    const ap       = apData.ap;
    const sharePct = apData.revenue_share_pct;
    const gross    = apData.month_gross;
    const share    = apData.month_host_share;
    const monarch  = apData.month_monarch_cut;

    const win = window.open('', '_blank', 'width=860,height=680');
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Monarch Wireless — Host Earnings ${monthLabel}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid #f0a500; margin-bottom: 20px; }
  .mark { width: 36px; height: 36px; background: #f0a500; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: #000; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-name { font-size: 15px; font-weight: 700; }
  .brand-sub { font-size: 10px; color: #888; letter-spacing: 1px; margin-top: 2px; }
  .meta { text-align: right; }
  .meta-title { font-size: 17px; font-weight: 700; }
  .meta-period { font-size: 12px; color: #f0a500; font-weight: 600; margin-top: 2px; }
  .meta-date { font-size: 10px; color: #888; margin-top: 2px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .kpi { background: #f8f9fc; border: 1px solid #e0e4f0; border-radius: 6px; padding: 12px 14px; }
  .kpi-val { font-size: 17px; font-weight: 700; }
  .kpi-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-top: 3px; }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 10px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f0f2f8; padding: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #555; text-align: left; }
  th:last-child { text-align: right; }
  td { padding: 8px; border-bottom: 1px solid #f0f2f8; font-size: 12px; }
  td:last-child { text-align: right; font-family: monospace; }
  .total-row td { font-weight: 700; border-top: 2px solid #e0e4f0; }
  .share-row td { background: #fff8e1; font-weight: 700; font-size: 13px; color: #92600a; }
  .bar-bg { background: #e0e4f0; border-radius: 3px; height: 5px; margin-top: 4px; }
  .bar-fill { background: #f0a500; border-radius: 3px; height: 5px; }
  .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e0e4f0; display: flex; justify-content: space-between; font-size: 10px; color: #aaa; }
</style></head><body>

<div class="header">
  <div class="brand">
    <div class="mark">M</div>
    <div><div class="brand-name">Monarch Wireless</div><div class="brand-sub">HOST EARNINGS STATEMENT</div></div>
  </div>
  <div class="meta">
    <div class="meta-title">${ap?.name || ap?.mac || 'Access Point'}</div>
    <div class="meta-period">${monthLabel}</div>
    <div class="meta-date">Printed ${new Date().toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</div>
  </div>
</div>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">KES ${fmt(gross)}</div><div class="kpi-lbl">Gross Revenue</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#92600a">KES ${fmt(share)}</div><div class="kpi-lbl">Your Share (${sharePct}%)</div></div>
  <div class="kpi"><div class="kpi-val">KES ${fmt(monarch)}</div><div class="kpi-lbl">Monarch Cut</div></div>
  <div class="kpi"><div class="kpi-val">KES ${fmt(apData?.today_host_share)}</div><div class="kpi-lbl">Today Your Share</div></div>
</div>

<div class="section-title">Revenue by Package — ${monthLabel}</div>
<table>
  <thead><tr><th>Package</th><th>Sessions</th><th style="text-align:right">Revenue</th><th style="text-align:right">Your Share</th></tr></thead>
  <tbody>
    ${(apData?.package_breakdown || []).map(p => {
      const pct2 = gross > 0 ? Math.round(p.revenue / gross * 100) : 0;
      const pkgShare = +(p.revenue * sharePct / 100).toFixed(0);
      return `<tr>
        <td>${p.name}<div class="bar-bg"><div class="bar-fill" style="width:${pct2}%"></div></div></td>
        <td>${p.sessions}</td>
        <td>KES ${fmt(p.revenue)}</td>
        <td>KES ${fmt(pkgShare)}</td>
      </tr>`;
    }).join('')}
    <tr class="total-row"><td>Total</td><td></td><td>KES ${fmt(gross)}</td><td>KES ${fmt(share)}</td></tr>
    <tr class="share-row"><td colspan="3">Your Earnings (${sharePct}% revenue share)</td><td>KES ${fmt(share)}</td></tr>
  </tbody>
</table>

<div class="section-title">Recent Transactions</div>
<table>
  <thead><tr><th>Phone</th><th>Package</th><th>Method</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>
    ${(apData?.recent_sessions || []).slice(0, 15).map(s =>
      `<tr><td>${s.phone || '—'}</td><td>${s.package_name || '—'}</td><td>${s.payment_method || '—'}</td><td>KES ${fmt(s.amount_paid)}</td></tr>`
    ).join('')}
  </tbody>
</table>

<div class="footer">
  <span>Monarch Wireless · Designers Hotspot · Nairobi</span>
  <span>Host Earnings Statement · ${ap?.name || ap?.mac}</span>
  <span>Confidential</span>
</div>

</body></html>`);
    win.document.close();
    win.onload = () => win.print();
  }

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  const sharePct      = apData?.revenue_share_pct ?? 70;
  const monthGross    = apData?.month_gross        ?? 0;
  const monthShare    = apData?.month_host_share   ?? 0;
  const monthMonarch  = apData?.month_monarch_cut  ?? 0;
  const todayShare    = apData?.today_host_share   ?? 0;
  const alltimeShare  = apData?.alltime_host_share ?? 0;
  const pkgBreakdown  = apData?.package_breakdown  ?? [];
  const recentSessions= apData?.recent_sessions    ?? [];

  // Chart: last 6 months from monthly_breakdown, always shown regardless of selected month
  const chartData = (apData?.monthly_breakdown || []).slice().reverse().map(m => ({
    month: m.month,
    gross: m.gross,
    share: m.host_share,
  }));

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>Host Portal</div>
          <h1 className={styles.headerTitle}>Earnings Report</h1>
        </div>
        <div className={styles.headerActions}>
          {/* AP selector — shown only when multiple APs */}
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
          <div className={styles.monthPicker}>
            <Calendar size={13} color="var(--text3)" />
            <select className={styles.monthSelect} value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className={styles.monthSelect} value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className={styles.printBtn} onClick={handlePrint} disabled={!apData}>
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </div>

      {!selAP ? (
        <div className={styles.empty}>Select an access point above to view earnings.</div>
      ) : apLoading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : apData ? (
        <div className={styles.report}>

          {/* ── Report title bar ── */}
          <div className={styles.reportTitle}>
            <div className={styles.reportBrand}>
              <div className={styles.reportMark}>M</div>
              <div>
                <div className={styles.reportBrandName}>Monarch Wireless</div>
                <div className={styles.reportBrandSub}>{apData.ap?.name || selAP} · {sharePct}% Revenue Share</div>
              </div>
            </div>
            <div className={styles.reportMeta}>
              <div className={styles.reportMetaTitle}>Host Earnings Statement</div>
              <div className={styles.reportMetaSub}>{monthLabel}</div>
              <div className={styles.reportMetaDate}>Generated {new Date().toLocaleDateString('en-KE')}</div>
            </div>
          </div>

          {/* ── KPI cards ── */}
          <div className={styles.kpiGrid}>
            <StatCard label="Gross Revenue" value={`KES ${fmt(monthGross)}`} sub={`${monthLabel}`} color="var(--text2)" icon={BarChart2} />
            <StatCard label={`Your Share (${sharePct}%)`} value={`KES ${fmt(monthShare)}`} sub="After revenue split" color="var(--accent)" icon={CreditCard} />
            <StatCard label="Monarch Cut" value={`KES ${fmt(monthMonarch)}`} sub={`${100 - sharePct}% of gross`} color="var(--cyan)" icon={TrendingUp} />
            <StatCard label="All-Time Your Share" value={`KES ${fmt(alltimeShare)}`} sub="Since launch" color="#8b5cf6" icon={Wifi} />
          </div>

          {/* ── 6-month trend chart ── */}
          {chartData.length > 0 && (
            <div className={styles.chartSection}>
              <div className={styles.sectionTitle}>6-Month Trend</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="month" tick={{ fill: 'var(--text3)', fontSize: 10, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} />
                  <YAxis hide />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="gross" fill="var(--surface3)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="share" fill="var(--accent)"   radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className={styles.twoCol}>
            {/* ── P&L breakdown ── */}
            <div className={styles.pnlSection}>
              <div className={styles.sectionTitle}>Earnings Breakdown — {monthLabel}</div>

              <div className={styles.pnlGroup}>
                <div className={styles.pnlGroupLabel}>Revenue</div>
                <div className={styles.pnlRow}>
                  <span className={styles.pnlLabel}>Gross Revenue</span>
                  <span className={styles.pnlValue}>KES {fmt(monthGross)}</span>
                </div>
              </div>

              <div className={styles.pnlGroup}>
                <div className={styles.pnlGroupLabel}>Revenue Split</div>
                <div className={styles.pnlRow}>
                  <span className={styles.pnlLabel}>Your Share ({sharePct}%)</span>
                  <span className={styles.pnlValue} style={{ color: 'var(--accent)' }}>KES {fmt(monthShare)}</span>
                </div>
                <div className={styles.pnlRow}>
                  <span className={styles.pnlLabel}>Monarch Cut ({100 - sharePct}%)</span>
                  <span className={styles.pnlValue} style={{ color: 'var(--text3)' }}>KES {fmt(monthMonarch)}</span>
                </div>
              </div>

              <div className={styles.pnlDivider} />

              <div className={`${styles.pnlRow} ${styles.pnlHighlight}`}>
                <span className={styles.pnlLabel}>YOUR EARNINGS</span>
                <span className={styles.pnlValue}>KES {fmt(monthShare)}</span>
              </div>

              <div className={styles.pnlGroup} style={{ marginTop: 16 }}>
                <div className={styles.pnlGroupLabel}>Key Metrics</div>
                <div className={styles.metricRow}>
                  <span>Today Gross</span>
                  <span className={styles.metricVal}>KES {fmt(apData.today_gross)}</span>
                </div>
                <div className={styles.metricRow}>
                  <span>Today Your Share</span>
                  <span className={styles.metricVal} style={{ color: 'var(--accent)' }}>KES {fmt(todayShare)}</span>
                </div>
                <div className={styles.metricRow}>
                  <span>All-Time Gross</span>
                  <span className={styles.metricVal}>KES {fmt(apData.alltime_gross)}</span>
                </div>
                <div className={styles.metricRow}>
                  <span>All-Time Your Share</span>
                  <span className={styles.metricVal}>KES {fmt(alltimeShare)}</span>
                </div>
              </div>
            </div>

            {/* ── Package breakdown ── */}
            <div className={styles.pkgSection}>
              <div className={styles.sectionTitle}>By Package — {monthLabel}</div>
              {pkgBreakdown.length === 0 ? (
                <div className={styles.noData}>No sessions this month</div>
              ) : (
                <div className={styles.pkgList}>
                  {pkgBreakdown.map((p, i) => {
                    const pct    = monthGross > 0 ? Math.round(p.revenue / monthGross * 100) : 0;
                    const pShare = +(p.revenue * sharePct / 100).toFixed(0);
                    const colors = ['var(--accent)', 'var(--cyan)', 'var(--green)', '#8b5cf6'];
                    return (
                      <div key={i} className={styles.pkgItem}>
                        <div className={styles.pkgHeader}>
                          <span className={styles.pkgName}>{p.name}</span>
                          <span className={styles.pkgRev}>KES {fmt(pShare)}</span>
                        </div>
                        <div className={styles.pkgBar}>
                          <div className={styles.pkgFill} style={{ width: `${pct}%`, background: colors[i % colors.length] }} />
                        </div>
                        <div className={styles.pkgMeta}>
                          <span>{p.sessions} sessions · KES {fmt(p.revenue)} gross</span>
                          <span>{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Recent transactions ── */}
              <div className={styles.sectionTitle} style={{ marginTop: 24 }}>Recent Transactions</div>
              {recentSessions.length === 0 ? (
                <div className={styles.noData}>No transactions yet</div>
              ) : (
                <div className={styles.txList}>
                  {recentSessions.slice(0, 10).map((s, i) => (
                    <div key={i} className={styles.txRow}>
                      <span className={styles.txPhone}>{s.phone || '—'}</span>
                      <span className={styles.txPkg}>{s.package_name}</span>
                      <span className={styles.txAmt}>KES {fmt(s.amount_paid)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.reportFooter}>
            <span>Monarch Wireless · Designers Hotspot · Nairobi</span>
            <span>Host Earnings Statement · {apData.ap?.name || selAP}</span>
            <span>Confidential</span>
          </div>
        </div>
      ) : (
        <div className={styles.empty}>Could not load earnings data.</div>
      )}
    </div>
  );
}