import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart2, TrendingUp, TrendingDown, Printer, Calendar,
  DollarSign, Settings, Check, Plus, Trash2, Edit2, X, Save,
  Wifi, Server, HardDrive, Users, Zap, Package,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
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
  return (
    <div className={styles.statCard}>
      <div className={styles.statTop}>
        <div className={styles.statIcon} style={{background:`${color}15`,color}}>{React.createElement(icon,{size:16,strokeWidth:1.8})}</div>
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
    const el = document.getElementById('report');
    if (!el) return;
    const win = window.open('','_blank','width=1100,height=800');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Monarch P&L</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Manrope:wght@400;500&family=DM+Mono&display=swap" rel="stylesheet"/>
<style>*{box-sizing:border-box;margin:0;padding:0}:root{--bg:#080c12;--surface:#0f1620;--surface2:#111c2a;--surface3:#162030;--border:#1e2d45;--border2:#2a3f5f;--accent:#f0a500;--green:#0dbb85;--cyan:#0dcfcf;--red:#f04060;--text:#dde6f0;--text2:#8a9bb5;--text3:#4a5a72;--font-display:'Syne',sans-serif;--font-body:'Manrope',sans-serif;--font-mono:'DM Mono',monospace;--radius:8px}
html,body{background:var(--bg);color:var(--text);font-family:var(--font-body);-webkit-print-color-adjust:exact;print-color-adjust:exact}
#rpt{padding:32px;display:flex;flex-direction:column;gap:24px}
.rpt-title{display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:1px solid var(--border)}
.rpt-brand{display:flex;align-items:center;gap:12px}.rpt-mark{width:36px;height:36px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:20px;font-weight:800;color:#000}
.rpt-brand-name{font-family:var(--font-display);font-size:16px;font-weight:700}.rpt-brand-sub{font-family:var(--font-mono);font-size:10px;color:var(--text3);letter-spacing:1px;margin-top:2px}
.rpt-meta{text-align:right}.rpt-meta-title{font-family:var(--font-display);font-size:18px;font-weight:700}.rpt-meta-sub{font-family:var(--font-mono);font-size:13px;color:var(--accent);margin-top:2px}.rpt-meta-date{font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-top:4px}
.rpt-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.rpt-kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px}.rpt-kpi-val{font-family:var(--font-display);font-size:18px;font-weight:800;margin-bottom:4px}.rpt-kpi-label{font-family:var(--font-mono);font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3)}.rpt-kpi-sub{font-size:11px;color:var(--text2);margin-top:4px}
.rpt-two{display:grid;grid-template-columns:1.1fr 1fr;gap:16px}
.rpt-section-title{font-family:var(--font-mono);font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:14px}
.rpt-pnl{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.rpt-group{margin-bottom:12px}.rpt-group-label{font-family:var(--font-mono);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);padding:6px 0;border-bottom:1px solid var(--border);margin-bottom:4px}
.rpt-row{display:flex;align-items:baseline;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.03)}
.rpt-row.highlight{background:rgba(240,165,0,0.06);border-radius:4px;padding:8px 10px;margin:4px -10px}.rpt-row.highlight .rpt-val{color:var(--accent);font-size:15px;font-weight:700}
.rpt-row.negative .rpt-val{color:var(--red)}.rpt-row.indent .rpt-lbl{padding-left:14px;color:var(--text2);font-size:12px}
.rpt-lbl{flex:1;font-size:13px;color:var(--text)}.rpt-val{font-family:var(--font-mono);font-size:13px;white-space:nowrap}.rpt-sub{font-family:var(--font-mono);font-size:10px;color:var(--text3);white-space:nowrap}
.rpt-divider{height:1px;background:var(--border2);margin:8px 0}
.rpt-metric{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:12.5px;color:var(--text2)}.rpt-metric-val{font-family:var(--font-mono);font-size:13px;font-weight:500}
.rpt-pkg{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px}.rpt-pkg-list{display:flex;flex-direction:column;gap:14px}.rpt-pkg-item{display:flex;flex-direction:column;gap:5px}.rpt-pkg-header{display:flex;justify-content:space-between}.rpt-pkg-name{font-size:13.5px;font-weight:500}.rpt-pkg-rev{font-family:var(--font-mono);font-size:13px}.rpt-pkg-bar{height:5px;background:var(--surface3);border-radius:3px;overflow:hidden}.rpt-pkg-fill{height:100%;border-radius:3px}.rpt-pkg-meta{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--text3)}
.rpt-alltime{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}.rpt-alltime-stat{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:14px;text-align:center}.rpt-alltime-val{font-family:var(--font-display);font-size:16px;font-weight:800;margin-bottom:4px}.rpt-alltime-lbl{font-family:var(--font-mono);font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text3)}
.rpt-footer{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--text3);padding-top:16px;border-top:1px solid var(--border)}
@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@page{margin:.5in}}</style>
</head><body><div id="rpt">${el.innerHTML}</div>
<script>
function remap(){const map=[['reportTitle','rpt-title'],['reportBrand','rpt-brand'],['reportMark','rpt-mark'],['reportBrandName','rpt-brand-name'],['reportBrandSub','rpt-brand-sub'],['reportMeta','rpt-meta'],['reportMetaTitle','rpt-meta-title'],['reportMetaSub','rpt-meta-sub'],['reportMetaDate','rpt-meta-date'],['kpiGrid','rpt-kpi'],['statCard','rpt-kpi-card'],['statVal','rpt-kpi-val'],['statLabel','rpt-kpi-label'],['statSub','rpt-kpi-sub'],['twoCol','rpt-two'],['sectionTitle','rpt-section-title'],['pnlSection','rpt-pnl'],['pnlGroup','rpt-group'],['pnlGroupLabel','rpt-group-label'],['pnlRow','rpt-row'],['pnlHighlight','highlight'],['pnlNegative','negative'],['pnlIndent','indent'],['pnlLabel','rpt-lbl'],['pnlValue','rpt-val'],['pnlSub','rpt-sub'],['pnlDivider','rpt-divider'],['metricRow','rpt-metric'],['metricVal','rpt-metric-val'],['pkgSection','rpt-pkg'],['pkgList','rpt-pkg-list'],['pkgItem','rpt-pkg-item'],['pkgHeader','rpt-pkg-header'],['pkgName','rpt-pkg-name'],['pkgRev','rpt-pkg-rev'],['pkgBar','rpt-pkg-bar'],['pkgFill','rpt-pkg-fill'],['pkgMeta','rpt-pkg-meta'],['allTimeGrid','rpt-alltime'],['allTimeStat','rpt-alltime-stat'],['allTimeVal','rpt-alltime-val'],['allTimeLbl','rpt-alltime-lbl'],['reportFooter','rpt-footer']];
document.querySelectorAll('[class]').forEach(n=>{Array.from(n.classList).forEach(c=>{map.forEach(([k,t])=>{if(c.includes(k)){n.classList.remove(c);t.split(' ').forEach(x=>n.classList.add(x))}})})});}
remap();
document.querySelectorAll('.recharts-tooltip-wrapper,.statTop,.statIcon,.expensePanel,.costsPanel').forEach(e=>e.remove());
setTimeout(()=>{window.print();window.close();},800);
</' + 'script></body></html>`);
    win.document.close();
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
          <button className={`${styles.costsBtn}${showCosts?' '+styles.costsBtnActive:''}`} onClick={()=>setShowCosts(s=>!s)}>
            <Settings size={14}/> Expenses
          </button>
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
                onDelete={handleDeleteExpense} locked={LOCKED.includes(e.id)}/>
            ))}
          </div>
          {showAddForm
            ? <AddExpenseForm onAdd={handleAddExpense} onClose={()=>setShowAddForm(false)}/>
            : <button className={styles.addExpenseBtn} onClick={()=>setShowAddForm(true)}><Plus size={13}/> Add Expense</button>
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