import { Link } from "react-router-dom";
import logo from "../assets/logo.png";

export default function Logo({ height = 48 }) {
  return (
    <Link to="/" aria-label="Главная" className="logo-link">
      <img
        src={logo}
        alt="Авантаж Плюс"
        className="logo-img"
        style={{ height, width: "auto", display: "block" }}
      />
    </Link>
  );
}
