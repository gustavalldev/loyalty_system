import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../api.js";

const ROLE_LABELS = {
  admin: "Администратор",
  manager: "Менеджер",
  partner: "Партнер",
  client: "Клиент"
};

export default function AdminUsersPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  async function load() {
    try {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const data = await apiGet(`/admin/users${qs}`);
      setItems(data.items || []);
    } catch (err) {
      setMessage(err.message || "Ошибка");
    }
  }

  async function adjust() {
    if (!selectedUser || !amount || !reason) {
      setMessage("Заполните пользователя, сумму и причину");
      return;
    }
    try {
      await apiPost("/admin/loyalty/adjustments", {
        user_id: selectedUser,
        amount: Number(amount),
        reason
      });
      setAmount("");
      setReason("");
      setSelectedUser(null);
      await load();
    } catch (err) {
      setMessage(err.message || "Ошибка");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3>Пользователи</h3>
        <div className="grid" style={{ gap: 10 }}>
          <input className="input" placeholder="Поиск по email" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="button" type="button" onClick={load}>Найти</button>
        </div>
      </div>

      <div className="card">
        <h3>Корректировка баланса</h3>
        <div className="form">
          <select className="input" value={selectedUser || ""} onChange={(e) => setSelectedUser(e.target.value)}>
            <option value="">Выберите пользователя</option>
            {items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email || u.phone}
              </option>
            ))}
          </select>
          <input className="input" placeholder="Сумма (может быть отрицательной)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="input" placeholder="Причина" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="button" type="button" onClick={adjust}>Сохранить</button>
        </div>
        {message && <div className="muted">{message}</div>}
      </div>

      <div className="card">
        <h3>Список пользователей</h3>
        <table className="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Email</th>
              <th>Телефон</th>
              <th>Роль</th>
              <th>Баланс</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name || "—"}</td>
                <td>{u.email || "—"}</td>
                <td>{u.phone || "—"}</td>
                <td>{ROLE_LABELS[u.role] || u.role || "—"}</td>
                <td>{u.balance ?? "0.00"} {u.currency || "BONUS"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <div className="muted" style={{ marginTop: 8 }}>Нет пользователей</div>}
      </div>
    </div>
  );
}
