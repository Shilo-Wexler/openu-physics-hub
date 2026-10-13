/** Read-only stars for an average: 4.2 shows four full stars and a fifth filled one fifth. */

import type { CSSProperties } from "react";

import styles from "./Stars.module.css";

/** One five-point star in a 24x24 box; RatingPanel's buttons draw the same shape. */
export const STAR_PATH =
  "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z";

const MAX = 5;

interface Props {
  value: number;
  /** Star size in px. */
  size?: number;
}

export default function Stars({ value, size = 16 }: Props) {
  const clamped = Math.max(0, Math.min(MAX, value));
  const whole = Math.floor(clamped);
  // The fill is measured in stars and gaps, not as a plain percentage: with gaps between
  // the stars, 84% of the row would cover less than a fifth of the fifth star.
  const fillWidth = `calc(${whole} * (var(--star-size) + var(--star-gap)) + ${(clamped - whole).toFixed(3)} * var(--star-size))`;

  return (
    <span
      className={styles.stars}
      style={{ "--star-size": `${size}px` } as CSSProperties}
      role="img"
      aria-label={`${clamped.toFixed(1)} מתוך ${MAX}`}
    >
      <StarRow className={styles.empty} />
      <span className={styles.fill} style={{ width: fillWidth }}>
        <StarRow className={styles.full} />
      </span>
    </span>
  );
}

function StarRow({ className }: { className: string | undefined }) {
  return (
    <span className={`${styles.row} ${className}`}>
      {Array.from({ length: MAX }, (_, index) => (
        <svg key={index} viewBox="0 0 24 24" aria-hidden="true">
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}
