import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../../api.js";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [target, setTarget] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState(1);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});

  async function handleRequest(event) {
    event.preventDefault();
    setMessage("");
    const nextErrors = {};
    if (!target) nextErrors.target = true;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage("Заполните обязательные поля");
      return;
    }
    try {
      await apiPost("/auth/request-password-reset", { target });
    } catch (err) {
      setMessage(err.message || "Ошибка");
      return;
    }
    setStep(2);
  }

  async function handleReset(event) {
    event.preventDefault();
    setMessage("");
    const nextErrors = {};
    if (!code) nextErrors.code = true;
    if (!newPassword) nextErrors.newPassword = true;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage("Заполните обязательные поля");
      return;
    }
    try {
      await apiPost("/auth/reset-password", { target, code, new_password: newPassword });
    } catch (err) {
      setMessage(err.message || "Ошибка");
      return;
    }
    navigate("/auth/login");
  }

  return (
    <form className="form" onSubmit={step === 1 ? handleRequest : handleReset}>
      <input
        className={`input${errors.target ? " invalid" : ""}`}
        placeholder="Email"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      />
      {step === 1 ? (
        <button className="button" type="submit">Отправить код</button>
      ) : (
        <>
          <input
            className={`input${errors.code ? " invalid" : ""}`}
            placeholder="Код из письма"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <input
            className={`input${errors.newPassword ? " invalid" : ""}`}
            placeholder="Новый пароль"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button className="button" type="submit">Сменить пароль</button>
        </>
      )}
      {message && <div style={{ color: "#dc2626" }}>{message}</div>}
    </form>
  );
}
