import { NavLink, Outlet } from "react-router-dom";
import Logo from "../components/Logo.jsx";

export default function AuthLayout() {
  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 520, margin: "40px auto" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <Logo height={56} />
        </div>
        <div className="hero" style={{ marginBottom: 16 }}>
          <div className="grid" style={{ gap: 6 }}>
            <div className="badge">Личный кабинет</div>
            <h2 style={{ margin: 0 }}>Система лояльности</h2>
            <div className="muted">Управляйте бонусами и рефералами в одном месте.</div>
          </div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <NavLink
            to="/auth/login"
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >Вход</NavLink>
          <NavLink
            to="/auth/register"
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >Регистрация</NavLink>
        </div>
        <div style={{ marginTop: 16 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
