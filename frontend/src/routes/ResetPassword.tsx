import { useSearchParams } from "react-router";

import Placeholder from "./Placeholder";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  return <Placeholder name="Новий пароль" detail={`/reset-password · token: ${token ?? "—"}`} />;
}
