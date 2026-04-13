import Link from 'next/link';
import type { WorkflowManifest } from '@/src/workflows/types';
import styles from './WorkflowCard.module.css';

interface WorkflowCardProps {
  manifest: WorkflowManifest;
  index: number;
}

const ACCENT_GRADIENTS = [
  'linear-gradient(135deg, #f472b6, #ec4899)',
  'linear-gradient(135deg, #818cf8, #6366f1)',
  'linear-gradient(135deg, #fb923c, #f97316)',
  'linear-gradient(135deg, #34d399, #10b981)',
  'linear-gradient(135deg, #60a5fa, #3b82f6)',
  'linear-gradient(135deg, #a78bfa, #8b5cf6)',
];

function getAccentGradient(index: number, tags?: string[]): string {
  if (tags && tags.length > 0) {
    // Use first tag's hash to pick a color
    const hash = tags[0].split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return ACCENT_GRADIENTS[hash % ACCENT_GRADIENTS.length];
  }
  return ACCENT_GRADIENTS[index % ACCENT_GRADIENTS.length];
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

export default function WorkflowCard({ manifest, index }: WorkflowCardProps) {
  const gradient = getAccentGradient(index, manifest.tags);

  return (
    <Link href={`/workflows/${manifest.id}`} className={styles.card}>
      <div
        className={styles.cardAccent}
        style={{ background: gradient }}
        aria-hidden="true"
      >
        <span className={styles.cardIcon}>{getInitial(manifest.name)}</span>
      </div>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{manifest.name}</h3>
        <p className={styles.cardDescription}>{manifest.description}</p>
        <span className={styles.versionBadge}>v{manifest.version}</span>
      </div>
    </Link>
  );
}
