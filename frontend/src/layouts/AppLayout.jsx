import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Logo from "../components/Logo.jsx";
import Burger from "../components/Burger.jsx";
import { apiGet } from "../api.js";

export default function AppLayout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    apiGet("/me")
      .then((data) => {
        if (!active) return;
        setIsAdmin(data.role === "admin");
      })
      .catch(() => {
        if (!active) return;
        setIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    navigate("/auth/login");
  }
  return (
    <div>
      <nav className="nav">
        <div className="nav-inner">
          <Logo height={72} />
          <div className="nav-links">
            <NavLink to="/">Дашборд</NavLink>
            <NavLink to="/transactions">История</NavLink>
            <NavLink to="/referrals">Рефералы</NavLink>
            <NavLink to="/guide">Инструкция</NavLink>
            {isAdmin && <NavLink to="/admin">Админка</NavLink>}
          </div>
          <div className="nav-right">
            <div className="profile-menu">
              <button className="profile-icon" type="button" aria-label="Профиль" />
              <div className="profile-dropdown">
                <NavLink to="/profile">Профиль</NavLink>
                <NavLink to="/security">Безопасность</NavLink>
                <button type="button" onClick={logout}>Выйти</button>
              </div>
            </div>
            <Burger open={menuOpen} onClick={() => setMenuOpen(!menuOpen)} />
          </div>
        </div>
      </nav>

      <div className={`drawer-backdrop ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} />
      <div className={`drawer ${menuOpen ? "open" : ""}`}>
        <NavLink to="/" onClick={() => setMenuOpen(false)}>Дашборд</NavLink>
        <NavLink to="/transactions" onClick={() => setMenuOpen(false)}>История</NavLink>
        <NavLink to="/referrals" onClick={() => setMenuOpen(false)}>Рефералы</NavLink>
        <NavLink to="/guide" onClick={() => setMenuOpen(false)}>Инструкция</NavLink>
        {isAdmin && <NavLink to="/admin" onClick={() => setMenuOpen(false)}>Админка</NavLink>}
        <div className="drawer-footer">
          <Logo height={56} />
        </div>
      </div>

      <div className="container">
        <Outlet />
      </div>
    </div>
  );
}
