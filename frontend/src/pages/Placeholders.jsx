import styles from './Placeholder.module.css';

export function NetworkPage() {
  return <Placeholder title="Network" label="AP Management" desc="Live status of every EAP610 in the mesh — coming next." />;
}
export function PackagesPage() {
  return <Placeholder title="Packages" label="Package Engine" desc="Create, edit and manage hotspot packages." />;
}
export function VouchersPage() {
  return <Placeholder title="Vouchers" label="Voucher System" desc="Generate and manage voucher codes." />;
}
export function UsersPage() {
  return <Placeholder title="Users" label="User Management" desc="View all users, sessions and loyalty points." />;
}
export function ReportsPage() {
  return <Placeholder title="Reports" label="Analytics Engine" desc="Generate your monthly P&L reports." />;
}

function Placeholder({ title, label, desc }) {
  return (
    <div className={styles.page}>
      <div className={styles.label}>{label}</div>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.desc}>{desc}</p>
      <div className={styles.badge}>Coming Soon</div>
    </div>
  );
}
