import styles from "./SegmentedControl.module.css";

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** A small number after the label, such as how many items are in this view. */
  count?: number;
}

interface Props<T extends string> {
  /** Read by screen readers: what the segments choose. */
  label: string;
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** While saving, so a second tap can't send another request. */
  disabled?: boolean;
}

/** An iOS-style segmented control: a grey track with the chosen segment as a white pill. */
export default function SegmentedControl<T extends string>({
  label,
  segments,
  value,
  onChange,
  disabled = false,
}: Props<T>) {
  return (
    <div className={styles.track} role="group" aria-label={label}>
      {segments.map((segment) => {
        const current = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            className={current ? `${styles.segment} ${styles.current}` : styles.segment}
            aria-pressed={current}
            disabled={disabled}
            onClick={() => {
              if (!current) onChange(segment.value);
            }}
          >
            {segment.label}
            {segment.count !== undefined && <span className={styles.count}>{segment.count}</span>}
          </button>
        );
      })}
    </div>
  );
}