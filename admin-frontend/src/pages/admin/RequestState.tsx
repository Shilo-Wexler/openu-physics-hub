import type { Status } from "../../api/requests";

/** A request's state, Gmail style: shown by shade, not by a text badge. */
export type State = "new" | "open" | "closed";

export const STATE_LABEL: Record<State, string> = {
  new: "חדשה",
  open: "בטיפול",
  closed: "סגורה",
};

export function stateOf(status: Status, isOpened: boolean): State {
  if (status === "closed") return "closed";
  return isOpened ? "open" : "new";
}

/** A small swatch in the state's shade, with its name (used in the detail panel and the legend). */
export default function StateSwatch({ state }: { state: State }) {
  return (
    <span className="state-swatch">
      <span className={`swatch state-${state}`} aria-hidden="true" />
      {STATE_LABEL[state]}
    </span>
  );
}
