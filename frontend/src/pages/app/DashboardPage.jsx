import { useEffect, useState } from "react";
import { apiGet } from "../../api.js";
import { useNavigate } from "react-router-dom";
import {
  getTransactionStatusLabel,
  getTransactionTypeLabel
} from "../../loyaltyLabels.js";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [recent, setRecent] = useState([]);
  const [refCode, setRefCode] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiGet("/loyalty/account")
      .then((data) => {
        setAccount(data);
        if (data?.balance) {
          localStorage.setItem("balance_amount", data.balance);
        }
      })
      .catch(() => setAccount(null));
    apiGet("/loyalty/transactions").then((data) => {
      const items = (data.items || []).slice(0, 5);
      setRecent(items);
    });
    apiGet("/referrals/code").then(setRefCode).catch(() => setRefCode(null));
  }, []);

  async function copyCode() {
    if (!refCode?.code) return;
    await navigator.clipboard.writeText(refCode.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="hero">
        <div className="grid" style={{ gap: 8 }}>
          <h2 style={{ margin: 0 }}>
            Добро пожаловать в <span className="accent-mint">личный кабинет</span>
          </h2>
          <div className="muted">
            Здесь вы управляете бонусами, начислениями и реферальной программой.
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="muted" style={{ fontSize: 12 }}>Баланс</div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>
            {account ? `${account.balance} ₽` : "—"}
          </div>
        </div>
        <div className="card">
          <div className="muted" style={{ fontSize: 12 }}>Мой промокод</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {refCode?.code || "—"}
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Делитесь кодом, чтобы получать вознаграждения.
          </div>
          <button className="button" style={{ marginTop: 10 }} onClick={copyCode}>
            {copied ? "Скопировано" : "Скопировать код"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Инструкция</h3>
        <div className="muted">
          Ознакомьтесь с инструкцией по работе с бонусами, начислениями и рефералами.
        </div>
        <button className="button" style={{ marginTop: 10 }} onClick={() => navigate("/guide")}>
          Открыть руководство
        </button>
      </div>

      <div className="card">
        <h3>Последние операции</h3>
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
            {recent.map((item) => (
              <tr key={`${item.external_ref}-${item.created_at}`}>
                <td>{getTransactionTypeLabel(item.type)}</td>
                <td>{getTransactionStatusLabel(item.status)}</td>
                <td>{item.amount}</td>
                <td>{new Date(item.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!recent.length && <div className="muted" style={{ marginTop: 8 }}>Пока нет операций</div>}
      </div>
    </div>
  );
}
