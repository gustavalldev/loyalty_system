import { NavLink, Outlet, useNavigate } from "react-router-dom";
import Logo from "../components/Logo.jsx";

export default function AdminLayout() {
  const navigate = useNavigate();
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
            <NavLink to="/admin">Пользователи</NavLink>
            <NavLink to="/admin/promo-codes">Промокоды</NavLink>
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
          </div>
        </div>
      </nav>
      <div className="container">
        <Outlet />
      </div>
    </div>
  );
}
