import { CHAT_NOT_CONFIGURED, loadErrorMessage } from "../shared/lib/errors";
import type { Loaded } from "./consoleContext";

/** The standard "could not load ..." line. A chat that is not set up yet is a notice, not an error. */
export default function LoadError({ loaded, what }: { loaded: Loaded<unknown>; what: string }) {
  if (!loaded.failed) return null;
  const message = loadErrorMessage(what, loaded.errorStatus, loaded.errorDetail);
  // Only the chat's own "not set up" 503; a database that is down is a real error.
  const className = loaded.errorDetail === CHAT_NOT_CONFIGURED ? "notice" : "error";
  return (
    <p className={className} role="alert">
      {message}
    </p>
  );
}
