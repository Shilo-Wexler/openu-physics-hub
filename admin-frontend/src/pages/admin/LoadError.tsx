import { loadErrorMessage } from "../../lib/errors";
import type { Loaded } from "./context";

/** The standard "could not load ..." line. A chat that is not set up yet is a notice, not an error. */
export default function LoadError({ loaded, what }: { loaded: Loaded<unknown>; what: string }) {
  if (!loaded.failed) return null;
  const message = loadErrorMessage(what, loaded.errorStatus, loaded.errorDetail);
  const className = loaded.errorStatus === 503 ? "notice" : "error";
  return (
    <p className={className} role="alert">
      {message}
    </p>
  );
}
