/** A segmented switch, as in iOS: a white pill slides to the chosen option and can be dragged. */

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

import styles from "./SegmentedControl.module.css";

// How far (px) a finger may move and still count as a tap, not a drag.
const DRAG_SLOP = 4;

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Read by screen readers: what the switch chooses. */
  label: string;
}

interface Drag {
  startX: number;
  startPosition: number;
  /** +1 when "next option" is to the right on screen, -1 in right-to-left pages. */
  direction: number;
  /** The width of one option, in px. */
  width: number;
  moved: boolean;
  /** Where the pill is now, in options: 0.5 is halfway between the first and the second. */
  position: number;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: Props<T>) {
  const count = options.length;
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  // Set only while a finger drags the pill; the pill follows it instead of the chosen option.
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const track = useRef<HTMLDivElement>(null);

  const position = dragPosition ?? index;
  // While dragging, the option under the pill already looks chosen.
  const shown = Math.round(position);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // As in iOS, the pill is dragged from the chosen option; a press anywhere else is a tap.
    const pressed = (event.target as Element).closest("button");
    if (pressed?.dataset.value !== value || !track.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startX: event.clientX,
      startPosition: index,
      direction: getComputedStyle(track.current).direction === "rtl" ? -1 : 1,
      width: pressed.offsetWidth,
      moved: false,
      position: index,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    const moved = (event.clientX - current.startX) * current.direction;
    if (!current.moved && Math.abs(moved) < DRAG_SLOP) return;
    current.moved = true;
    current.position = Math.max(
      0,
      Math.min(count - 1, current.startPosition + moved / current.width),
    );
    setDragPosition(current.position);
  }

  // The pill lands on the nearest option, and that option is chosen.
  function handlePointerUp() {
    const current = drag.current;
    drag.current = null;
    if (!current?.moved) return;
    setDragPosition(null);
    const landed = options[Math.round(current.position)];
    if (landed && landed.value !== value) onChange(landed.value);
  }

  function handlePointerCancel() {
    drag.current = null;
    setDragPosition(null);
  }

  return (
    <div
      ref={track}
      className={dragPosition === null ? styles.track : `${styles.track} ${styles.dragging}`}
      style={{ "--count": count, "--position": position } as CSSProperties}
      role="group"
      aria-label={label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <span className={styles.thumb} aria-hidden="true" />
      {options.map((option, i) => (
        <button
          key={option.value}
          className={i === shown ? `${styles.segment} ${styles.active}` : styles.segment}
          type="button"
          data-value={option.value}
          // Toggle buttons: tells a screen reader which option is on.
          aria-pressed={option.value === value}
          onClick={() => {
            if (option.value !== value) onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
