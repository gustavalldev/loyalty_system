import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { apiPost } from "../../api.js";

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { target, purpose, full_name, password: initialPassword, phone } = location.state || {};
  const [code, setCode] = useState("");
  const [password, setPassword] = useState(initialPassword || "");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    const nextErrors = {};
    if (!code) nextErrors.code = true;
    if (!password) nextErrors.password = true;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage("Заполните обязательные поля");
      return;
    }
    let data;
    try {
      data = await apiPost("/auth/verify-otp", {
        target,
        code,
        purpose,
        full_name,
        password,
        phone
      });
    } catch (err) {
      setMessage(err.message || "Ошибка");
      return;
    }
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    navigate("/");
  }

  if (!target || !purpose) {
    return <div>Сначала запросите код.</div>;
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div style={{ fontSize: 13, color: "#64748b" }}>Код отправлен на {target}</div>
      <input
        className={`input${errors.code ? " invalid" : ""}`}
        placeholder="Код из письма"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <input
        className={`input${errors.password ? " invalid" : ""}`}
        placeholder="Пароль"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="button" type="submit">Подтвердить</button>
      {message && <div style={{ color: "#dc2626" }}>{message}</div>}
    </form>
  );
}
