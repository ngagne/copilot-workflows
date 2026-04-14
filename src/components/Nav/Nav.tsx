'use client';

import { signOut } from 'next-auth/react';
import Link from 'next/link';
import ThemeToggle from '@/src/components/ThemeToggle/ThemeToggle';
import styles from './Nav.module.css';

interface NavProps {
  userName?: string;
  userEmail?: string;
  userImage?: string;
}

export default function Nav({ userName, userEmail, userImage }: NavProps) {
  return (
    <nav className={styles.nav}>
      <Link href="/dashboard" className={styles.logo}>
        AI Workflows
      </Link>
      <div className={styles.userSection}>
        <ThemeToggle />
        <div className={styles.userInfo}>
          {userImage && (
            <img src={userImage} alt={userName ?? 'User'} className={styles.avatar} />
          )}
          <span className={styles.userName}>{userName ?? 'User'}</span>
        </div>
        <form
          action={async () => {
            await signOut({ redirectTo: '/' });
          }}
        >
          <button type="submit" className={styles.btnPill}>
            Sign Out
          </button>
        </form>
      </div>
    </nav>
  );
}
