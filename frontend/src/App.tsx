import { BrowserRouter, Route, Routes } from "react-router";

import ForgotPassword from "./routes/ForgotPassword";
import Landing from "./routes/Landing";
import Login from "./routes/Login";
import NotFound from "./routes/NotFound";
import Profile from "./routes/Profile";
import Register from "./routes/Register";
import Reservations from "./routes/Reservations";
import ResetPassword from "./routes/ResetPassword";
import Search from "./routes/Search";
import Settings from "./routes/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/reservations" element={<Reservations />} />
        <Route path="/search" element={<Search />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
