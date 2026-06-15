import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../api.js";
import { getReferralStatusLabel } from "../../loyaltyLabels.js";

function buildQuery(status) {
  if (!status) return "";
  const params = new URLSearchParams({ status });
  return `?${params.toString()}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export default function AdminReferralAttributionsPage() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("registered");
  const [message, setMessage] = useState("");
  const [confirmingId, setConfirmingId] = useState(null);

  async function load() {
    try {
      setMessage("");
      const data = await apiGet(`/admin/referral-attributions${buildQuery(status)}`);
      setItems(data.items || []);
    } catch (err) {
      setMessage(err.message || "Ошибка");
    }
  }

  async function confirmPurchase(item) {
    setConfirmingId(item.id);
    setMessage("");
    try {
      await apiPost(`/admin/referral-attributions/${item.id}/confirm-purchase`);
      await load();
      setMessage("Покупка подтверждена, бонус владельцу промокода начислен");
    } catch (err) {
      setMessage(err.message || "Ошибка");
    } finally {
      setConfirmingId(null);
    }
  }

  useEffect(() => {
    let active = true;
    apiGet("/admin/referral-attributions?status=registered")
      .then((data) => {
        if (!active) return;
        setItems(data.items || []);
      })
      .catch((err) => {
        if (!active) return;
        setMessage(err.message || "Ошибка");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3>Покупки рефералов</h3>
        <div className="grid two">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="registered">Ожидает покупки</option>
            <option value="paid">Покупка подтверждена</option>
            <option value="">Все статусы</option>
          </select>
          <button className="button" type="button" onClick={load}>Показать</button>
        </div>
        {message && <div className="muted" style={{ marginTop: 8 }}>{message}</div>}
      </div>

      <div className="card">
        <h3>Регистрации по промокодам</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Реферал</th>
              <th>Промокод</th>
              <th>Владелец</th>
              <th>Статус</th>
              <th>Бонус владельцу</th>
              <th>Регистрация</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const canConfirm = item.status === "registered" && !item.paid_at;
              return (
                <tr key={item.id}>
                  <td>{item.client_contact || "—"}</td>
                  <td>{item.code || "—"}</td>
                  <td>{item.referrer_full_name || item.referrer_email || item.referrer_phone || "—"}</td>
                  <td>{getReferralStatusLabel(item.status)}</td>
                  <td>{item.status === "paid" ? item.amount_paid : item.bonus_referrer}</td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    {canConfirm && (
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => confirmPurchase(item)}
                        disabled={confirmingId === item.id}
                      >
                        {confirmingId === item.id ? "Подтверждаем" : "Подтвердить покупку"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && <div className="muted" style={{ marginTop: 8 }}>Нет регистраций</div>}
      </div>
    </div>
  );
}
