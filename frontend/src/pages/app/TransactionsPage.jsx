import { useEffect, useState } from "react";
import { apiGet } from "../../api.js";
import {
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  getTransactionStatusLabel,
  getTransactionTypeLabel
} from "../../loyaltyLabels.js";

function buildQuery({ type, status, from, to }) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  if (from || to) params.set("period", `${from || ""}:${to || ""}`);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default function TransactionsPage() {
  const [items, setItems] = useState([]);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let active = true;
    apiGet("/loyalty/transactions").then((data) => {
      if (!active) return;
      setItems(data.items || []);
    });
    return () => {
      active = false;
    };
  }, []);

  async function load() {
    const query = buildQuery({ type, status, from, to });
    const data = await apiGet(`/loyalty/transactions${query}`);
    setItems(data.items || []);
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3>Фильтры</h3>
        <div className="grid two">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Тип</option>
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Статус</option>
            {Object.entries(TRANSACTION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
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
                <td>{getTransactionTypeLabel(item.type)}</td>
                <td>{getTransactionStatusLabel(item.status)}</td>
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
