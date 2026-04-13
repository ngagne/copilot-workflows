import { auth } from '@/src/auth';
import { redirect, notFound } from 'next/navigation';
import { getWorkflow } from '@/src/workflows/loader';
import Nav from '@/src/components/Nav/Nav';
import WorkflowRunner from '@/src/components/WorkflowRunner/WorkflowRunner';
import Link from 'next/link';
import styles from './workflow.module.css';

interface WorkflowPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkflowPage({ params }: WorkflowPageProps) {
  const session = await auth();
  if (!session) {
    redirect('/');
  }

  const { id } = await params;
  const workflow = getWorkflow(id);

  if (!workflow) {
    notFound();
  }

  return (
    <main className={styles.main}>
      <Nav
        userName={session.user?.name ?? undefined}
        userEmail={session.user?.email ?? undefined}
        userImage={session.user?.image ?? undefined}
      />
      <div className={styles.content}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/dashboard">Workflows</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>{workflow.manifest.name}</span>
        </nav>
        <h1 className={styles.title}>{workflow.manifest.name}</h1>
        <p className={styles.description}>{workflow.manifest.description}</p>
        <WorkflowRunner manifest={workflow.manifest} workflowId={workflow.manifest.id} />
      </div>
    </main>
  );
}
