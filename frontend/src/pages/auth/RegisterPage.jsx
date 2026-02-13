import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../../api.js";

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (!digits.length) return "";
  const normalized = digits.startsWith("7") ? digits : `7${digits}`;
  const parts = [
    normalized.slice(0, 1),
    normalized.slice(1, 4),
    normalized.slice(4, 7),
    normalized.slice(7, 9),
    normalized.slice(9, 11)
  ];
  let result = `+${parts[0]}`;
  if (parts[1]) result += ` (${parts[1]}`;
  if (parts[1] && parts[1].length === 3) result += ")";
  if (parts[2]) result += ` ${parts[2]}`;
  if (parts[3]) result += `-${parts[3]}`;
  if (parts[4]) result += `-${parts[4]}`;
  return result;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [target, setTarget] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    if (step === 1) {
      const nextErrors = {};
      if (!target) nextErrors.target = true;
      if (!fullName) nextErrors.fullName = true;
      if (!phone) nextErrors.phone = true;
      if (!password) nextErrors.password = true;
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length) {
        setMessage("Заполните обязательные поля");
        return;
      }
      try {
        await apiPost("/auth/register", {
          target,
          channel: "email",
          full_name: fullName,
          phone
        });
      } catch (err) {
        setMessage(err.message || "Ошибка");
        return;
      }
      setStep(2);
      return;
    }

    const nextErrors = {};
    if (!code) nextErrors.code = true;
    if (!password) nextErrors.password = true;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage("Заполните обязательные поля");
      return;
    }
    try {
      const data = await apiPost("/auth/verify-otp", {
        target,
        code,
        purpose: "register",
        full_name: fullName,
        password,
        phone
      });
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      navigate("/");
    } catch (err) {
      setMessage(err.message || "Ошибка");
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <input
        className={`input${errors.target ? " invalid" : ""}`}
        placeholder="Email"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      />
      <input
        className={`input${errors.fullName ? " invalid" : ""}`}
        placeholder="ФИО"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />
      <input
        className={`input${errors.phone ? " invalid" : ""}`}
        placeholder="Телефон"
        value={phone}
        onChange={(e) => setPhone(formatPhone(e.target.value))}
      />
      <input
        className={`input${errors.password ? " invalid" : ""}`}
        placeholder="Пароль"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {step === 2 && (
        <input
          className={`input${errors.code ? " invalid" : ""}`}
          placeholder="Код из письма"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      )}
      <button className="button" type="submit">
        {step === 1 ? "Регистрация" : "Подтвердить"}
      </button>
      {message && <div style={{ color: "#dc2626" }}>{message}</div>}
    </form>
  );
}
