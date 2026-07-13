import { Link, useNavigate } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { Button } from "./ui/Button";
import { Wordmark } from "./Wordmark";

export function AppBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
      <Link to="/" aria-label="OPTATA home">
        <Wordmark size="sm" />
      </Link>
      {user ? (
        <div className="flex items-center gap-1">
          <Link
            to={`/u/${user.username}`}
            className="px-2 font-mono text-sm lowercase tracking-tight underline-offset-4 hover:underline"
          >
            u/{user.username}
          </Link>
          <Button variant="ghost" onClick={() => void logout()} className="h-9 px-3 text-sm">
            Log out
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate("/login")} className="h-9 px-3 text-sm">
            Log in
          </Button>
          <Button
            variant="primary"
            onClick={() => navigate("/register")}
            className="h-9 px-3 text-sm"
          >
            Create yours
          </Button>
        </div>
      )}
    </header>
  );
}
