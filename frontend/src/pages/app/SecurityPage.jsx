import { useState } from "react";
import { apiPost } from "../../api.js";

export default function SecurityPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1);
  const [message, setMessage] = useState("");

  async function requestReset() {
    setMessage("");
    if (!currentPassword || !newPassword) {
      setMessage("Введите текущий и новый пароль");
      return;
    }
    try {
      await apiPost("/auth/change-password/request", { current_password: currentPassword });
      setStep(2);
    } catch (err) {
      if (err?.message === "invalid_credentials") {
        setMessage("Неверный текущий пароль");
      } else {
        setMessage(err.message || "Ошибка");
      }
    }
  }

  async function confirmReset() {
    setMessage("");
    if (!code) {
      setMessage("Введите код из письма");
      return;
    }
    try {
      await apiPost("/auth/change-password/confirm", {
        code,
        new_password: newPassword,
        current_password: currentPassword
      });
      setMessage("Пароль обновлён");
      setStep(1);
      setCode("");
      setNewPassword("");
      setCurrentPassword("");
    } catch (err) {
      if (err?.message === "invalid_code") {
        setMessage("Неверный код подтверждения");
      } else if (err?.message === "invalid_credentials") {
        setMessage("Неверный текущий пароль");
      } else {
        setMessage(err.message || "Ошибка");
      }
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Безопасность</h2>
        <div className="muted">Смена пароля с подтверждением по email.</div>
      </div>

      <div className="card">
        <div className="form">
          <input
            className="input"
            placeholder="Текущий пароль"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <input
            className="input"
            placeholder="Новый пароль"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          {step === 1 ? (
            <button className="button" type="button" onClick={requestReset}>
              Отправить код
            </button>
          ) : (
            <>
              <input
                className="input"
                placeholder="Код из письма"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button className="button" type="button" onClick={confirmReset}>
                Подтвердить смену
              </button>
            </>
          )}
          {message && <div className="muted">{message}</div>}
        </div>
      </div>
    </div>
  );
}
