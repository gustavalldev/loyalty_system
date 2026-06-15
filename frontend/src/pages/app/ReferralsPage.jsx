import { useEffect, useState } from "react";
import { apiGet } from "../../api.js";
import { getReferralStatusLabel } from "../../loyaltyLabels.js";

export default function ReferralsPage() {
  const [code, setCode] = useState(null);
  const [items, setItems] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiGet("/referrals/code").then(setCode);
    apiGet("/referrals/attributions").then((data) => setItems(data.items || []));
  }, []);

  async function copyCode() {
    if (!code?.code) return;
    await navigator.clipboard.writeText(code.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="muted" style={{ fontSize: 12 }}>Ваш промокод</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{code?.code || "—"}</div>
        <button className="button" style={{ marginTop: 10 }} onClick={copyCode}>
          {copied ? "Скопировано" : "Скопировать код"}
        </button>
      </div>
      <div className="card">
        <h3>Регистрации по коду</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Контакт</th>
              <th>Статус</th>
              <th>Бонус</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.crm_deal_id || item.client_contact}-${item.created_at}`}>
                <td>{item.client_contact || item.crm_deal_id || "—"}</td>
                <td>{getReferralStatusLabel(item.paid_at ? "paid" : item.status)}</td>
                <td>{item.paid_at ? item.amount_paid || 0 : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <div className="muted" style={{ marginTop: 8 }}>Нет данных</div>}
      </div>
    </div>
  );
}
