import { auth } from '@/src/auth';
import { redirect } from 'next/navigation';
import { getWorkflows } from '@/src/workflows/loader';
import Nav from '@/src/components/Nav/Nav';
import WorkflowCard from '@/src/components/WorkflowCard/WorkflowCard';
import styles from './dashboard.module.css';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) {
    redirect('/');
  }

  const workflows = getWorkflows();

  return (
    <main className={styles.main}>
      <Nav
        userName={session.user?.name ?? undefined}
        userEmail={session.user?.email ?? undefined}
        userImage={session.user?.image ?? undefined}
      />
      <div className={styles.content}>
        <h1 className={styles.heading}>Workflows</h1>
        <p className={styles.subtext}>Select a workflow to get started</p>
        <div className={styles.grid}>
          {workflows.map((manifest, index) => (
            <WorkflowCard key={manifest.id} manifest={manifest} index={index} />
          ))}
        </div>
        {workflows.length === 0 && (
          <p className={styles.empty}>No workflows found. Add a workflow to <code>src/workflows/</code>.</p>
        )}
      </div>
    </main>
  );
}
