/** The type filter beside the course search: a round button that opens the system's own menu (on an iPhone,
    the iOS list). With a type chosen, it grows into a blue pill that names it. */

import { INQUIRY_TYPES, type InquiryType } from "../../api/inquiries";
import { TYPE_LABEL } from "../../lib/inquiryLabels";
import styles from "./TypeFilter.module.css";

// Three lines getting shorter, like iOS Mail's filter icon; drawn like the bottom bar's icons.
const FILTER_ICON = ["M3 6h18", "M7 12h10", "M10 18h4"];

interface Props {
  /** null = every type. */
  value: InquiryType | null;
  onChange: (type: InquiryType | null) => void;
}

export default function TypeFilter({ value, onChange }: Props) {
  return (
    <div className={value === null ? styles.button : `${styles.button} ${styles.active}`}>
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        {FILTER_ICON.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      {/* Hidden from screen readers: the select below already says the chosen type. */}
      {value !== null && (
        <span className={styles.label} aria-hidden="true">
          {TYPE_LABEL[value]}
        </span>
      )}

      {/* The real control: the system's select, invisible and stretched over the whole button, so a tap
          anywhere on it opens the native menu, and screen readers get an ordinary select. */}
      <select
        className={styles.select}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as InquiryType))}
        aria-label="סינון לפי סוג"
      >
        <option value="">כל הסוגים</option>
        {INQUIRY_TYPES.map((type) => (
          <option key={type} value={type}>
            {TYPE_LABEL[type]}
          </option>
        ))}
      </select>
    </div>
  );
}
