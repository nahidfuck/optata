import { useParams } from "react-router";

import Placeholder from "./Placeholder";

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  return <Placeholder name="Профіль" detail={`/u/${username ?? ""}`} />;
}
