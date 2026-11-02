/** A long text (a chat message) cut to a few lines, with a button that shows all of it. A short text shows
    whole, with no button. The caller's className styles the box around it (background, padding). */

import { useLayoutEffect, useRef, useState } from "react";

import styles from "./LongText.module.css";

interface Props {
  children: string;
  className?: string;
}

export default function LongText({ children, className }: Props) {
  const text = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Whether the cut text hides anything; measured, since it depends on the width as much as on the length.
  const [long, setLong] = useState(false);

  useLayoutEffect(() => {
    const element = text.current;
    // While open nothing is cut, so the last answer stands (the button must stay to close it again).
    if (!element || open) return;
    const measure = () => setLong(element.scrollHeight > element.clientHeight + 1);
    measure();
    // The width changes with the window, and with it the number of lines.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, open]);

  const textClass = open ? styles.text : long ? `${styles.text} ${styles.cut} ${styles.fade}` : `${styles.text} ${styles.cut}`;

  return (
    <div className={className}>
      <div ref={text} className={textClass} dir="auto">
        {children}
      </div>
      {long && (
        <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "הצגה מקוצרת" : "הצגת ההודעה המלאה"}
        </button>
      )}
    </div>
  );
}