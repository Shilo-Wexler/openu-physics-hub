/** The message under a form field that failed a check. */
export default function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <span id={id} className="field-error" role="alert">
      {message}
    </span>
  );
}
