export default function GuidePage() {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="hero">
        <div className="grid" style={{ gap: 8 }}>
          <div className="badge">Руководство</div>
          <h2 style={{ marginTop: 0 }}>Как пользоваться личным кабинетом</h2>
          <div className="muted">
            Делитесь промокодом, следите за начислениями и управляйте бонусами.
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Поделитесь промокодом</h3>
        <div className="muted">
          Дайте свой промокод друзьям или клиентам. Когда они оформят оплату, вы получите
          <span className="accent-mint"> бонус</span>.
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          Начисление происходит после подтверждения оплаты в CRM и может иметь период ожидания.
        </div>
      </div>

      <div className="grid two">
        <div className="card accent-card">
          <h3>1. Дашборд</h3>
          <div className="muted">
            Баланс, промокод, последние операции и материалы — <span className="accent-mint">всё в одном месте</span>.
          </div>
        </div>
        <div className="card accent-card">
          <h3>2. История операций</h3>
          <div className="muted">
            <span className="accent-mint">Полная история</span> начислений и списаний. Фильтруйте по типу, статусу и периоду.
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card accent-card">
          <h3>3. Рефералы</h3>
          <div className="muted">
            Список атрибуций и статусов. Следите за оплатами и <span className="accent-mint">вознаграждениями</span>.
          </div>
        </div>
        <div className="card accent-card">
          <h3>4. Материалы</h3>
          <div className="muted">
            Инструкции, правила программы и <span className="accent-mint">полезные советы</span> по работе с системой.
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card accent-card">
          <h3>5. Профиль</h3>
          <div className="muted">
            Данные пользователя и <span className="accent-mint">контактная информация</span>.
          </div>
        </div>
        <div className="card accent-card">
          <h3>6. Безопасность</h3>
          <div className="muted">
            Настройки безопасности и <span className="accent-mint">смена пароля</span>.
          </div>
        </div>
      </div>
    </div>
  );
}
