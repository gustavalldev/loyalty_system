import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../../api.js";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [target, setTarget] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});

  function validateBaseFields() {
    const nextErrors = {};
    if (!target) nextErrors.target = true;
    if (!fullName) nextErrors.fullName = true;
    if (!phone) nextErrors.phone = true;
    if (!password) nextErrors.password = true;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage("Заполните обязательные поля");
      return false;
    }
    return true;
  }

  async function handleRequestCode() {
    setMessage("");
    if (!validateBaseFields()) return;
    try {
      await apiPost("/auth/register/request-code", {
        target,
        phone
      });
      setStep(2);
      setMessage("Код отправлен на email");
    } catch (err) {
      setMessage(err.message || "Ошибка");
    }
  }

  async function handleRegister() {
    setMessage("");
    if (!validateBaseFields()) return;
    if (!code) {
      setErrors((current) => ({ ...current, code: true }));
      setMessage("Введите код из письма");
      return;
    }
    setErrors({});
    try {
      const data = await apiPost("/auth/register", {
        target,
        full_name: fullName,
        password,
        phone,
        promo_code: promoCode,
        code
      });
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      navigate("/");
    } catch (err) {
      setMessage(err.message || "Ошибка");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (step === 1) {
      await handleRequestCode();
      return;
    }
    await handleRegister();
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
        placeholder="Телефон: +7 или 8..."
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className={`input${errors.password ? " invalid" : ""}`}
        placeholder="Пароль"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        className="input"
        placeholder="Промокод (если есть)"
        value={promoCode}
        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
      />
      {step === 2 && (
        <input
          className={`input${errors.code ? " invalid" : ""}`}
          placeholder="Код из письма"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setErrors((current) => ({ ...current, code: false }));
          }}
        />
      )}
      <button className="button" type="submit">
        {step === 1 ? "Отправить код" : "Завершить регистрацию"}
      </button>
      {step === 2 && (
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setStep(1);
            setCode("");
            setMessage("");
          }}
        >
          Изменить данные
        </button>
      )}
      {message && <div style={{ color: "#dc2626" }}>{message}</div>}
    </form>
  );
}
