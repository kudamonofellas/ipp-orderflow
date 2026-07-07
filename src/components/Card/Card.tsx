import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Removes default padding for cards that manage their own inner spacing. */
  flush?: boolean;
}

/** White elevated surface. Matches the Card baseline in ui-registry.md. */
export function Card({ children, flush = false, className, ...rest }: CardProps) {
  const classes = [styles.card, flush ? styles.flush : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
