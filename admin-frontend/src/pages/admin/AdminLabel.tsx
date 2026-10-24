import { useAdmin } from "./context";

/** An admin by name, from the admins list. One no longer on the list (removed) shows by email. */
export default function AdminLabel({ email }: { email: string }) {
  const { nameOf } = useAdmin();
  const name = nameOf(email);
  return name ? <bdi>{name}</bdi> : <bdi dir="ltr">{email}</bdi>;
}
