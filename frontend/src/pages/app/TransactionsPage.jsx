import { useEffect, useState } from "react";
import { apiGet } from "../../api.js";

export default function TransactionsPage() {
  const [items, setItems] = useState([]);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    load();
  }, []);

  function buildQuery() {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    if (from || to) params.set("period", `${from || ""}:${to || ""}`);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  async function load() {
    const data = await apiGet(`/loyalty/transactions${buildQuery()}`);
    setItems(data.items || []);
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3>Фильтры</h3>
        <div className="grid two">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Тип</option>
            <option value="accrual">Начисление</option>
            <option value="redemption">Списание</option>
            <option value="adjustment">Корректировка</option>
            <option value="hold">Холд</option>
            <option value="release">Релиз</option>
          </select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Статус</option>
            <option value="pending">Ожидает</option>
            <option value="confirmed">Подтверждено</option>
            <option value="cancelled">Отменено</option>
          </select>
          <input
            className="input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            className="input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button className="button" style={{ marginTop: 12 }} onClick={load}>
          Применить
        </button>
      </div>

      <div className="card">
        <h3>История операций</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Тип</th>
              <th>Статус</th>
              <th>Сумма</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.external_ref}-${item.created_at}`}>
                <td>{item.type}</td>
                <td>{item.status}</td>
                <td>{item.amount}</td>
                <td>{new Date(item.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <div style={{ color: "#64748b", marginTop: 8 }}>Нет операций</div>}
      </div>
    </div>
  );
}
