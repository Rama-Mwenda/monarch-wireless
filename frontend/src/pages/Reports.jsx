import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart2, TrendingUp, TrendingDown, Printer, Calendar,
  DollarSign, Settings, Plus, Trash2, Edit2, X, Save,
  Wifi, Server, HardDrive, Users, Zap, Package,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import styles from './Reports.module.css';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const CATEGORIES = [
  { value: 'isp',      label: 'ISP / Internet',   icon: Wifi      },
  { value: 'hardware', label: 'Hardware',          icon: HardDrive },
  { value: 'vps',      label: 'VPS / Hosting',     icon: Server    },
  { value: 'staff',    label: 'Staff / Salaries',  icon: Users     },
  { value: 'power',    label: 'Power / Electric',  icon: Zap       },
  { value: 'other',    label: 'Other',             icon: Package   },
];
function getCatIcon(cat) { return (CATEGORIES.find(c => c.value === cat) || CATEGORIES[5]).icon; }
function getCatLabel(cat){ return (CATEGORIES.find(c => c.value === cat) || CATEGORIES[5]).label; }
function fmt(n) { return Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:0}); }

function PnLRow({ label, value, sub, highlight, negative, indent }) {
  return (
    <div className={`${styles.pnlRow}${highlight?' '+styles.pnlHighlight:''}${negative?' '+styles.pnlNegative:''}${indent?' '+styles.pnlIndent:''}`}>
      <span className={styles.pnlLabel}>{label}</span>
      <span className={styles.pnlValue}>KES {fmt(value)}</span>
      {sub && <span className={styles.pnlSub}>{sub}</span>}
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  const Icon = icon;
  return (
    <div className={styles.statCard}>
      <div className={styles.statTop}>
        <div className={styles.statIcon} style={{background:`${color}15`,color}}><Icon size={16} strokeWidth={1.8}/></div>
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
      <div className={styles.tooltipVal}>KES {fmt(payload[0]?.value)}</div>
    </div>
  );
}

function ExpenseRow({ expense, onSave, onDelete, locked }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    label: expense.label, amount: expense.amount, category: expense.category,
    is_monthly: !!expense.is_monthly, amort_months: expense.amort_months || 24,
  });
  const [saving, setSaving] = useState(false);
  const monthly = expense.is_monthly ? expense.amount
    : (expense.amort_months > 0 ? Math.round(expense.amount / expense.amort_months) : 0);

  async function handleSave() {
    setSaving(true); await onSave(expense.id, form); setSaving(false); setEditing(false);
  }

  if (editing) return (
    <div className={styles.expenseRowEditing}>
      <div className={styles.expenseEditGrid}>
        <div className={styles.expenseEditField}>
          <label className={styles.expenseEditLabel}>Name</label>
          <input className={styles.expenseEditInput} value={form.label}
            onChange={e => setForm(f=>({...f,label:e.target.value}))}/>
        </div>
        <div className={styles.expenseEditField}>
          <label className={styles.expenseEditLabel}>Category</label>
          <select className={styles.expenseEditSelect} value={form.category}
            onChange={e => setForm(f=>({...f,category:e.target.value}))}>
            {CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className={styles.expenseEditField}>
          <label className={styles.expenseEditLabel}>Amount (KES)</label>
          <input className={styles.expenseEditInput} type="number" min="0" value={form.amount}
            onChange={e => setForm(f=>({...f,amount:Number(e.target.value)}))}/>
        </div>
        <div className={styles.expenseEditField}>
          <label className={styles.expenseEditLabel}>Type</label>
          <select className={styles.expenseEditSelect} value={form.is_monthly?'monthly':'onetime'}
            onChange={e => setForm(f=>({...f,is_monthly:e.target.value==='monthly'}))}>
            <option value="monthly">Monthly recurring</option>
            <option value="onetime">One-time (amortized)</option>
          </select>
        </div>
        {!form.is_monthly && (
          <div className={styles.expenseEditField}>
            <label className={styles.expenseEditLabel}>Spread over (months)</label>
            <input className={styles.expenseEditInput} type="number" min="1" max="120"
              value={form.amort_months}
              onChange={e => setForm(f=>({...f,amort_months:Number(e.target.value)||1}))}/>
          </div>
        )}
      </div>
      <div className={styles.expenseEditActions}>
        <button className={styles.expenseSaveBtn} onClick={handleSave} disabled={saving}>
          <Save size={12}/> {saving?'Saving…':'Save'}
        </button>
        <button className={styles.expenseCancelBtn} onClick={()=>setEditing(false)}>
          <X size={12}/> Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.expenseRow}>
      <div className={styles.expenseCatIcon}>{React.createElement(getCatIcon(expense.category),{size:13})}</div>
      <div className={styles.expenseInfo}>
        <div className={styles.expenseName}>{expense.label}</div>
        <div className={styles.expenseMeta}>
          {getCatLabel(expense.category)} · {expense.is_monthly ? 'Monthly' : `One-time ÷ ${expense.amort_months}mo = KES ${fmt(monthly)}/mo`}
        </div>
      </div>
      <div className={styles.expenseAmount}>
        <div className={styles.expenseAmountMain}>KES {fmt(expense.amount)}</div>
        {!expense.is_monthly && <div className={styles.expenseAmountSub}>KES {fmt(monthly)}/mo</div>}
      </div>
      <div className={styles.expenseActions}>
        <button className={styles.expenseEditBtn} onClick={()=>setEditing(true)} title="Edit"><Edit2 size={12}/></button>
        {!locked && <button className={styles.expenseDeleteBtn} onClick={()=>onDelete(expense.id)} title="Delete"><Trash2 size={12}/></button>}
      </div>
    </div>
  );
}

function AddExpenseForm({ onAdd, onClose }) {
  const [form, setForm] = useState({label:'',amount:0,category:'other',is_monthly:true,amort_months:24});
  const [saving, setSaving] = useState(false);
  async function handleAdd() {
    if (!form.label.trim()) return;
    setSaving(true); await onAdd(form); setSaving(false); onClose();
  }
  return (
    <div className={styles.addExpenseForm}>
      <div className={styles.addExpenseTitle}><Plus size={13}/> Add Expense</div>
      <div className={styles.expenseEditGrid}>
        <div className={styles.expenseEditField}>
          <label className={styles.expenseEditLabel}>Name</label>
          <input className={styles.expenseEditInput} placeholder="e.g. Electricity"
            value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))}/>
        </div>
        <div className={styles.expenseEditField}>
          <label className={styles.expenseEditLabel}>Category</label>
          <select className={styles.expenseEditSelect} value={form.category}
            onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
            {CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className={styles.expenseEditField}>
          <label className={styles.expenseEditLabel}>Amount (KES)</label>
          <input className={styles.expenseEditInput} type="number" min="0"
            value={form.amount} onChange={e=>setForm(f=>({...f,amount:Number(e.target.value)}))}/>
        </div>
        <div className={styles.expenseEditField}>
          <label className={styles.expenseEditLabel}>Type</label>
          <select className={styles.expenseEditSelect} value={form.is_monthly?'monthly':'onetime'}
            onChange={e=>setForm(f=>({...f,is_monthly:e.target.value==='monthly'}))}>
            <option value="monthly">Monthly recurring</option>
            <option value="onetime">One-time (amortized)</option>
          </select>
        </div>
        {!form.is_monthly && (
          <div className={styles.expenseEditField}>
            <label className={styles.expenseEditLabel}>Spread over (months)</label>
            <input className={styles.expenseEditInput} type="number" min="1"
              value={form.amort_months} onChange={e=>setForm(f=>({...f,amort_months:Number(e.target.value)||1}))}/>
          </div>
        )}
      </div>
      <div className={styles.expenseEditActions}>
        <button className={styles.expenseSaveBtn} onClick={handleAdd} disabled={saving||!form.label.trim()}>
          <Plus size={12}/> {saving?'Adding…':'Add Expense'}
        </button>
        <button className={styles.expenseCancelBtn} onClick={onClose}><X size={12}/> Cancel</button>
      </div>
    </div>
  );
}

export default function Reports() {
  const { admin } = useAuth();
  const isViewer = admin?.role === 'viewer';
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());
  const [dashboard,  setDashboard]  = useState(null);
  const [expenses,   setExpenses]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showCosts,  setShowCosts]  = useState(false);
  const [showAddForm,setShowAddForm]= useState(false);
  const LOCKED = ['isp-default','hw-default','vps-default'];

  const loadExpenses = useCallback(() => {
    api.get('/payment/expenses').then(r=>setExpenses(r.data.expenses||[])).catch(console.error);
  }, []);

  useEffect(() => {
    Promise.all([api.get('/dashboard'), api.get('/payment/expenses')])
      .then(([dash, exp]) => { setDashboard(dash.data); setExpenses(exp.data.expenses||[]); })
      .catch(console.error).finally(()=>setLoading(false));
  }, []);

  async function handleSaveExpense(id, form) { await api.put(`/payment/expenses/${id}`, form); loadExpenses(); }
  async function handleAddExpense(form)       { await api.post('/payment/expenses', form);       loadExpenses(); }
  async function handleDeleteExpense(id) {
    if (!confirm('Delete this expense?')) return;
    try { await api.delete(`/payment/expenses/${id}`); loadExpenses(); }
    catch(e) { alert(e.response?.data?.error || 'Could not delete'); }
  }

  if (loading) return <div className={styles.loading}><div className={styles.spinner}/></div>;

  const revenue      = dashboard?.revenue_month    || 0;
  const revenueToday = dashboard?.revenue_today    || 0;
  const allTime      = dashboard?.revenue_alltime  || 0;
  const totalUsers   = dashboard?.total_users      || 0;
  const pkgBreakdown = dashboard?.package_breakdown || [];
  const dailyData    = dashboard?.daily_revenue    || [];

  const activeExpenses = expenses.filter(e => e.is_active !== 0);
  const totalCosts = activeExpenses.reduce((sum, e) => {
    const m = e.is_monthly ? e.amount : (e.amort_months > 0 ? e.amount / e.amort_months : 0);
    return sum + m;
  }, 0);

  const netProfit    = revenue - totalCosts;
  const profitMargin = revenue > 0 ? ((netProfit/revenue)*100).toFixed(1) : 0;
  const roi          = totalCosts > 0 ? ((netProfit/totalCosts)*100).toFixed(1) : revenue > 0 ? '∞' : '0';
  const totalPkgRev  = pkgBreakdown.reduce((s,p)=>s+p.revenue,0);

  const chartData = dailyData.slice(-30).map(d=>({date:d.date?.slice(5), revenue:d.revenue||0}));
  const avgDaily  = chartData.length > 0 ? Math.round(chartData.reduce((s,d)=>s+d.revenue,0)/chartData.length) : 0;
  const monthLabel= `${MONTHS[selectedMonth]} ${selectedYear}`;

  const expensesByCategory = CATEGORIES
    .map(cat=>({...cat, items: activeExpenses.filter(e=>e.category===cat.value)}))
    .filter(cat=>cat.items.length > 0);

  function handlePrint() {
    const win = window.open('', '_blank', 'width=900,height=700');

    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Monarch Wireless — P&L Report ${monthLabel}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { padding: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid #f0a500; margin-bottom: 18px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .mark { width: 36px; height: 36px; background: #f0a500; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: #000; }
  .brand-name { font-size: 16px; font-weight: 700; color: #0f1620; }
  .brand-sub { font-size: 10px; color: #888; letter-spacing: 1px; margin-top: 2px; }
  .meta-title { font-size: 18px; font-weight: 700; text-align: right; }
  .meta-period { font-size: 12px; color: #f0a500; font-weight: 600; text-align: right; margin-top: 2px; }
  .meta-date { font-size: 10px; color: #888; text-align: right; margin-top: 2px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 18px; }
  .kpi { background: #f8f9fc; border: 1px solid #e0e4f0; border-radius: 6px; padding: 12px 14px; }
  .kpi-val { font-size: 17px; font-weight: 700; color: #0f1620; }
  .kpi-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-top: 3px; }
  .kpi-sub { font-size: 11px; color: #555; margin-top: 4px; }
  .section { margin-bottom: 18px; }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 8px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  .tbl-head th { background: #f0f2f8; padding: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #555; text-align: left; }
  .tbl-head th:last-child { text-align: right; }
  tr { border-bottom: 1px solid #f0f2f8; }
  .cat-row td { background: #f8f9fc; font-size: 11px; font-weight: 600; color: #555; padding: 6px 8px; letter-spacing: 1px; text-transform: uppercase; }
  .total-row td { font-weight: 700; font-size: 13px; padding: 10px 8px; border-top: 2px solid #e0e4f0; }
  .net-row td { font-weight: 800; font-size: 14px; padding: 10px 8px; background: ${netProfit >= 0 ? '#f0fdf4' : '#fff5f5'}; color: ${netProfit >= 0 ? '#166534' : '#991b1b'}; border-top: 2px solid ${netProfit >= 0 ? '#86efac' : '#fca5a5'}; }
  .pkg-bar-bg { background: #e0e4f0; border-radius: 3px; height: 6px; }
  .pkg-bar-fill { background: #f0a500; border-radius: 3px; height: 6px; }
  .two-col { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; }
  .metric-row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #f0f2f8; font-size: 12px; }
  .metric-val { font-weight: 600; font-family: monospace; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e0e4f0; display: flex; justify-content: space-between; font-size: 10px; color: #aaa; }
  @media print {
    @page { size: A4 portrait; margin: 18mm 16mm; }
    body { font-size: 12px; }
    .kpi-val { font-size: 15px; }
  }
</style></head><body><div class="page">

  <div class="header">
    <div class="brand">
      <div class="mark">M</div>
      <div><div class="brand-name">Monarch Wireless</div><div class="brand-sub">DESIGNERS HOTSPOT · NAIROBI</div></div>
    </div>
    <div>
      <div class="meta-title">Profit & Loss Statement</div>
      <div class="meta-period">${monthLabel}</div>
      <div class="meta-date">Printed ${new Date().toLocaleString('en-KE', {dateStyle:'medium',timeStyle:'short'})}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-val">KES ${revenue.toLocaleString()}</div><div class="kpi-lbl">Gross Revenue</div><div class="kpi-sub">KES ${revenueToday.toLocaleString()} today</div></div>
    <div class="kpi"><div class="kpi-val" style="color:${netProfit>=0?'#166534':'#991b1b'}">KES ${netProfit.toLocaleString()}</div><div class="kpi-lbl">Net Profit</div><div class="kpi-sub">${profitMargin}% margin</div></div>
    <div class="kpi"><div class="kpi-val">KES ${totalCosts.toLocaleString()}</div><div class="kpi-lbl">Total Costs</div><div class="kpi-sub">Monthly operating</div></div>
    <div class="kpi"><div class="kpi-val">${roi}%</div><div class="kpi-lbl">ROI</div><div class="kpi-sub">${totalUsers} total users</div></div>
  </div>

  <div class="two-col">
    <div class="section">
      <div class="section-title">P&L Summary</div>
      <table>
        <thead class="tbl-head"><tr><th>Item</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>
          <tr class="cat-row"><td colspan="2">REVENUE</td></tr>
          <tr><td style="padding:6px 8px;font-size:12px">Gross Revenue</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-size:12px;color:#166534">KES ${revenue.toLocaleString()}</td></tr>
          <tr class="cat-row"><td colspan="2">OPERATING COSTS</td></tr>
          ${expensesByCategory.map(cat => `
            <tr class="cat-row"><td colspan="2" style="padding-left:16px;font-size:10px">${cat.label}</td></tr>
            ${cat.items.map(e => {
              const m = e.is_monthly ? e.amount : (e.amort_months > 0 ? Math.round(e.amount/e.amort_months) : 0);
              return `<tr><td style="padding:5px 8px 5px 24px;color:#555;font-size:12px">${e.label}</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-size:12px">KES ${m.toLocaleString()}</td></tr>`;
            }).join('')}
          `).join('')}
          <tr class="total-row"><td>Total Costs</td><td style="text-align:right;font-family:monospace">KES ${totalCosts.toLocaleString()}</td></tr>
          <tr class="net-row"><td>Net Profit</td><td style="text-align:right;font-family:monospace">KES ${netProfit.toLocaleString()}</td></tr>
        </tbody>
      </table>
    </div>

    <div>
      <div class="section">
        <div class="section-title">Revenue by Package</div>
        <table>
          ${pkgBreakdown.map(p => {
            const pct = totalPkgRev > 0 ? Math.round(p.revenue/totalPkgRev*100) : 0;
            return `<tr style="border-bottom:1px solid #f0f2f8">
              <td style="padding:7px 8px;font-size:12px">${p.name}<div style="margin-top:4px"><div class="pkg-bar-bg"><div class="pkg-bar-fill" style="width:${pct}%"></div></div></div></td>
              <td style="padding:7px 8px;text-align:right;font-family:monospace;font-size:12px;white-space:nowrap">KES ${p.revenue.toLocaleString()}<br/><span style="font-size:10px;color:#888">${p.sessions} sessions</span></td>
            </tr>`;
          }).join('')}
        </table>
      </div>

      <div class="section" style="margin-top:14px">
        <div class="section-title">Key Metrics</div>
        <div class="metric-row"><span>Avg Daily Revenue</span><span class="metric-val">KES ${avgDaily.toLocaleString()}</span></div>
        <div class="metric-row"><span>Profit Margin</span><span class="metric-val">${profitMargin}%</span></div>
        <div class="metric-row"><span>Return on Investment</span><span class="metric-val">${roi}%</span></div>
        <div class="metric-row"><span>All-Time Revenue</span><span class="metric-val">KES ${allTime.toLocaleString()}</span></div>
        <div class="metric-row"><span>Total Users</span><span class="metric-val">${totalUsers}</span></div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>Monarch Wireless · Designers Hotspot · Nairobi</span>
    <span>Generated by Monarch Dashboard</span>
  </div>

</div></body></html>`);
    win.document.close();
    win.onload = () => win.print();
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>Analytics Engine</div>
          <h1 className={styles.headerTitle}>Reports</h1>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.monthPicker}>
            <Calendar size={13} color="var(--text3)"/>
            <select className={styles.monthSelect} value={selectedMonth} onChange={e=>setSelectedMonth(parseInt(e.target.value))}>
              {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <select className={styles.monthSelect} value={selectedYear} onChange={e=>setSelectedYear(parseInt(e.target.value))}>
              {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {!isViewer && (
            <button className={`${styles.costsBtn}${showCosts?' '+styles.costsBtnActive:''}`} onClick={()=>setShowCosts(s=>!s)}>
              <Settings size={14}/> Expenses
            </button>
          )}
          <button className={styles.printBtn} onClick={handlePrint}><Printer size={14}/> Print / PDF</button>
        </div>
      </div>

      {/* ── EXPENSES PANEL ── */}
      {showCosts && (
        <div className={`${styles.costsPanel} expensePanel`}>
          <div className={styles.costsPanelTitle}>
            <Settings size={13}/> Operating Expenses
            <span className={styles.costsPanelSub}>
              Monthly total: KES {fmt(Math.round(totalCosts))} · Used to calculate net profit &amp; ROI
            </span>
          </div>
          <div className={styles.expenseList}>
            {expenses.map(e=>(
              <ExpenseRow key={e.id} expense={e} onSave={handleSaveExpense}
                onDelete={handleDeleteExpense} locked={LOCKED.includes(e.id) || isViewer}/>
            ))}
          </div>
          {showAddForm
            ? <AddExpenseForm onAdd={handleAddExpense} onClose={()=>setShowAddForm(false)}/>
            : (!isViewer && <button className={styles.addExpenseBtn} onClick={()=>setShowAddForm(true)}><Plus size={13}/> Add Expense</button>)
          }
        </div>
      )}

      {/* ── REPORT ── */}
      <div className={styles.report} id="report">
        <div className={styles.reportTitle}>
          <div className={styles.reportBrand}>
            <div className={styles.reportMark}>M</div>
            <div>
              <div className={styles.reportBrandName}>Monarch Wireless</div>
              <div className={styles.reportBrandSub}>Designers Hotspot · Nairobi</div>
            </div>
          </div>
          <div className={styles.reportMeta}>
            <div className={styles.reportMetaTitle}>Monthly P&amp;L Report</div>
            <div className={styles.reportMetaSub}>{monthLabel}</div>
            <div className={styles.reportMetaDate}>Generated {new Date().toLocaleDateString('en-KE')}</div>
          </div>
        </div>

        <div className={styles.kpiGrid}>
          <StatCard label="Monthly Revenue" value={`KES ${fmt(revenue)}`} sub={`Today: KES ${fmt(revenueToday)}`} color="var(--accent)" icon={DollarSign}/>
          <StatCard label="Net Profit" value={`KES ${fmt(Math.round(netProfit))}`} sub={`${profitMargin}% margin`} color={netProfit>=0?'var(--green)':'var(--red)'} icon={netProfit>=0?TrendingUp:TrendingDown}/>
          <StatCard label="ROI" value={`${roi}%`} sub={totalCosts>0?`Costs: KES ${fmt(Math.round(totalCosts))}`:'Add expenses to calculate'} color="var(--cyan)" icon={BarChart2}/>
          <StatCard label="All-Time Revenue" value={`KES ${fmt(allTime)}`} sub={`${totalUsers} total users`} color="#8b5cf6" icon={TrendingUp}/>
        </div>

        <div className={styles.chartSection}>
          <div className={styles.sectionTitle}>Revenue — Last 30 Days</div>
          {chartData.length === 0
            ? <div className={styles.noData}>No revenue data for this period</div>
            : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{top:4,right:4,bottom:0,left:0}}>
                  <XAxis dataKey="date" tick={{fill:'var(--text3)',fontSize:9,fontFamily:'DM Mono'}} tickLine={false} axisLine={false}/>
                  <YAxis hide/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Bar dataKey="revenue" radius={[3,3,0,0]}>
                    {chartData.map((d,i)=><Cell key={i} fill={d.revenue>0?'var(--accent)':'var(--surface3)'}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>

        <div className={styles.twoCol}>
          <div className={styles.pnlSection}>
            <div className={styles.sectionTitle}>Profit &amp; Loss — {monthLabel}</div>

            <div className={styles.pnlGroup}>
              <div className={styles.pnlGroupLabel}>REVENUE</div>
              <PnLRow label="Gross Revenue" value={revenue} highlight/>
              {pkgBreakdown.map((p,i)=>(
                <PnLRow key={i} label={p.name} value={p.revenue}
                  sub={`${p.sessions} sessions · ${totalPkgRev>0?Math.round(p.revenue/totalPkgRev*100):0}%`} indent/>
              ))}
              {pkgBreakdown.length===0 && <PnLRow label="No sessions this month" value={0} indent/>}
            </div>

            <div className={styles.pnlGroup}>
              <div className={styles.pnlGroupLabel}>OPERATING COSTS</div>
              {activeExpenses.length===0 && <PnLRow label="No expenses configured" value={0} indent/>}
              {expensesByCategory.map(cat=>cat.items.map(e=>{
                const m = e.is_monthly ? e.amount : (e.amort_months>0 ? Math.round(e.amount/e.amort_months) : 0);
                return <PnLRow key={e.id} label={e.label} value={m}
                  sub={!e.is_monthly?`÷${e.amort_months}mo`:undefined} negative={m>0} indent/>;
              }))}
              <PnLRow label="Total Costs" value={Math.round(totalCosts)} negative={totalCosts>0}/>
            </div>

            <div className={styles.pnlDivider}/>

            <PnLRow label="NET PROFIT" value={Math.round(netProfit)} highlight negative={netProfit<0}
              sub={totalCosts===0?'Add expenses to see true profit':netProfit<0?`Need KES ${fmt(Math.abs(Math.round(netProfit)))} more to break even`:`${profitMargin}% profit margin`}/>

            <div className={styles.pnlGroup}>
              <div className={styles.pnlGroupLabel}>KEY METRICS</div>
              <div className={styles.metricRow}>
                <span>Return on Investment (ROI)</span>
                <span className={styles.metricVal} style={{color:totalCosts===0?'var(--text3)':Number(roi)>=0?'var(--green)':'var(--red)'}}>{roi}%</span>
              </div>
              <div className={styles.metricRow}>
                <span>Break-even revenue needed</span>
                <span className={styles.metricVal}>KES {fmt(Math.round(totalCosts))}</span>
              </div>
              <div className={styles.metricRow}>
                <span>Daily avg revenue (30d)</span>
                <span className={styles.metricVal}>KES {fmt(avgDaily)}</span>
              </div>
              <div className={styles.metricRow}>
                <span>Days to break even (monthly)</span>
                <span className={styles.metricVal}>{avgDaily>0&&totalCosts>0?`${Math.ceil(totalCosts/avgDaily)} days`:'—'}</span>
              </div>
            </div>
          </div>

          <div className={styles.pkgSection}>
            <div className={styles.sectionTitle}>Package Performance</div>
            {pkgBreakdown.length===0
              ? <div className={styles.noData}>No sessions recorded yet</div>
              : (
                <div className={styles.pkgList}>
                  {pkgBreakdown.map((p,i)=>{
                    const pct = totalPkgRev>0?Math.round(p.revenue/totalPkgRev*100):0;
                    const colors = ['var(--accent)','var(--cyan)','var(--green)','#8b5cf6'];
                    return (
                      <div key={i} className={styles.pkgItem}>
                        <div className={styles.pkgHeader}><span className={styles.pkgName}>{p.name}</span><span className={styles.pkgRev}>KES {fmt(p.revenue)}</span></div>
                        <div className={styles.pkgBar}><div className={styles.pkgFill} style={{width:`${pct}%`,background:colors[i%colors.length]}}/></div>
                        <div className={styles.pkgMeta}><span>{p.sessions} sessions</span><span>{pct}% of revenue</span></div>
                      </div>
                    );
                  })}
                </div>
              )
            }

            <div className={styles.sectionTitle} style={{marginTop:24}}>All-Time Summary</div>
            <div className={styles.allTimeGrid}>
              <div className={styles.allTimeStat}><div className={styles.allTimeVal}>KES {fmt(allTime)}</div><div className={styles.allTimeLbl}>Total Revenue</div></div>
              <div className={styles.allTimeStat}><div className={styles.allTimeVal}>{totalUsers}</div><div className={styles.allTimeLbl}>Total Users</div></div>
              <div className={styles.allTimeStat}><div className={styles.allTimeVal}>{totalUsers>0?`KES ${fmt(Math.round(allTime/totalUsers))}`:'—'}</div><div className={styles.allTimeLbl}>Avg per User</div></div>
            </div>
          </div>
        </div>

        <div className={styles.reportFooter}>
          <span>Monarch Wireless · Designers Hotspot · Nairobi</span>
          <span>Report generated {new Date().toLocaleString('en-KE')}</span>
          <span>Confidential</span>
        </div>
      </div>
    </div>
  );
}