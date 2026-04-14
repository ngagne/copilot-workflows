import styles from './Chip.module.css';

interface ChipProps {
  label: string;
  variant?: 'default' | 'brand';
}

export default function Chip({ label, variant = 'default' }: ChipProps) {
  return (
    <span className={`${styles.chip} ${styles[variant]}`}>
      {label}
    </span>
  );
}
