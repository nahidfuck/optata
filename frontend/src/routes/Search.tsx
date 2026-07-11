import { useSearchParams } from "react-router";

import Placeholder from "./Placeholder";

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get("q");
  return <Placeholder name="Пошук" detail={`/search · q: ${q ?? "—"}`} />;
}
