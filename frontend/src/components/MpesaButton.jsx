// Drop this anywhere in the app to open the M-Pesa payment modal
import { useState } from 'react';
import MpesaPayModal from './MpesaPayModal';
import styles from './MpesaButton.module.css';

export default function MpesaButton({ label = 'Collect Payment', pkg }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={styles.btn} onClick={() => setOpen(true)}>
        <span className={styles.mLogo}>M</span>
        {label}
      </button>
      {open && <MpesaPayModal onClose={() => setOpen(false)} preselectedPackage={pkg} />}
    </>
  );
}