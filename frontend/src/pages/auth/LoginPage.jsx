import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../../api.js";

export default function LoginPage() {
  const navigate = useNavigate();
  const [target, setTarget] = useState("");
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
      if (!password) nextErrors.password = true;
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length) {
        setMessage("Заполните обязательные поля");
        return;
      }
      try {
        await apiPost("/auth/login", { target, channel: "email", password });
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
        purpose: "login",
        password
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
        {step === 1 ? "Войти" : "Подтвердить"}
      </button>
      <button className="button secondary" type="button" onClick={() => navigate("/auth/reset")}
      >Забыли пароль</button>
      {message && <div style={{ color: "#dc2626" }}>{message}</div>}
    </form>
  );
}
