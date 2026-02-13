import { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../api.js";

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiGet("/me").then((data) => {
      setProfile(data);
      setFullName(data.full_name || "");
    });
  }, []);

  async function save() {
    setMessage("");
    try {
      const data = await apiPatch("/me", { full_name: fullName });
      setProfile(data);
      setMessage("Сохранено");
    } catch (err) {
      setMessage(err.message || "Ошибка");
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Профиль</h2>
        <div className="muted">Основные данные пользователя</div>
      </div>

      <div className="card">
        <div className="form">
          <input
            className="input"
            placeholder="ФИО"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <input className="input" placeholder="Email" value={profile?.email || ""} readOnly />
          <input className="input" placeholder="Телефон" value={profile?.phone || ""} readOnly />
          <button className="button" type="button" onClick={save}>Сохранить</button>
          {message && <div className="muted">{message}</div>}
        </div>
      </div>
    </div>
  );
}
