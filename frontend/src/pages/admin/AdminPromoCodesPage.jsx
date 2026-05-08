import { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../api.js";

const STATUS_LABELS = {
  active: "Активен",
  blocked: "Заблокирован",
  archived: "В архиве"
};

export default function AdminPromoCodesPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draftCode, setDraftCode] = useState("");
  const [draftStatus, setDraftStatus] = useState("active");
  const [draftBonusNewUser, setDraftBonusNewUser] = useState("100");
  const [draftBonusReferrer, setDraftBonusReferrer] = useState("100");
  const [draftMaxUses, setDraftMaxUses] = useState("");

  async function load() {
    try {
      setMessage("");
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const data = await apiGet(`/admin/referral-codes${qs}`);
      setItems(data.items || []);
    } catch (err) {
      setMessage(err.message || "Ошибка");
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setDraftCode(item.code || "");
    setDraftStatus(item.status || "active");
    setDraftBonusNewUser(String(item.bonus_new_user ?? "100"));
    setDraftBonusReferrer(String(item.bonus_referrer ?? "100"));
    setDraftMaxUses(item.max_uses == null ? "" : String(item.max_uses));
    setMessage("");
  }

  async function save() {
    if (!editingId || !draftCode.trim()) {
      setMessage("Укажите код");
      return;
    }
    try {
      await apiPatch(`/admin/referral-codes/${editingId}`, {
        code: draftCode.trim().toUpperCase(),
        status: draftStatus,
        bonus_new_user: Number(draftBonusNewUser),
        bonus_referrer: Number(draftBonusReferrer),
        max_uses: draftMaxUses === "" ? null : Number(draftMaxUses)
      });
      setEditingId(null);
      setDraftCode("");
      setDraftStatus("active");
      setDraftBonusNewUser("100");
      setDraftBonusReferrer("100");
      setDraftMaxUses("");
      await load();
    } catch (err) {
      setMessage(err.message || "Ошибка");
    }
  }

  useEffect(() => {
    apiGet("/admin/referral-codes")
      .then((data) => setItems(data.items || []))
      .catch((err) => setMessage(err.message || "Ошибка"));
  }, []);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3>Промокоды</h3>
        <div className="grid" style={{ gap: 10 }}>
          <input className="input" placeholder="Поиск по коду, email или имени" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="button" type="button" onClick={load}>Найти</button>
        </div>
      </div>

      <div className="card">
        <h3>Редактирование</h3>
        <div className="form">
          <input
            className="input"
            placeholder="Код"
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value.toUpperCase())}
            disabled={!editingId}
          />
          <select className="input" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)} disabled={!editingId}>
            <option value="active">Активен</option>
            <option value="blocked">Заблокирован</option>
            <option value="archived">В архиве</option>
          </select>
          <input
            className="input"
            placeholder="Бонус новому пользователю"
            value={draftBonusNewUser}
            onChange={(e) => setDraftBonusNewUser(e.target.value)}
            disabled={!editingId}
          />
          <input
            className="input"
            placeholder="Бонус владельцу кода"
            value={draftBonusReferrer}
            onChange={(e) => setDraftBonusReferrer(e.target.value)}
            disabled={!editingId}
          />
          <input
            className="input"
            placeholder="Лимит использований (пусто = без лимита)"
            value={draftMaxUses}
            onChange={(e) => setDraftMaxUses(e.target.value)}
            disabled={!editingId}
          />
          <button className="button" type="button" onClick={save} disabled={!editingId}>Сохранить</button>
        </div>
        {message && <div className="muted">{message}</div>}
      </div>

      <div className="card">
        <h3>Список кодов</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Код</th>
              <th>Статус</th>
              <th>Бонусы</th>
              <th>Лимит</th>
              <th>Пользователь</th>
              <th>Email</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.code}</td>
                <td>{STATUS_LABELS[item.status] || item.status || "—"}</td>
                <td>{item.bonus_new_user} / {item.bonus_referrer}</td>
                <td>{item.max_uses == null ? `∞ (${item.uses_count || 0})` : `${item.uses_count || 0}/${item.max_uses}`}</td>
                <td>{item.full_name || "—"}</td>
                <td>{item.email || item.phone || "—"}</td>
                <td>
                  <button className="button secondary" type="button" onClick={() => startEdit(item)}>
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <div className="muted" style={{ marginTop: 8 }}>Нет промокодов</div>}
      </div>
    </div>
  );
}
