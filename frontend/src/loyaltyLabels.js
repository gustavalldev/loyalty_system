export const ROLE_LABELS = {
  admin: "Администратор",
  manager: "Менеджер",
  partner: "Партнер",
  client: "Клиент"
};

export const TRANSACTION_TYPE_LABELS = {
  accrual: "Начисление",
  redemption: "Списание",
  adjustment: "Корректировка",
  hold: "Резерв",
  release: "Разблокировка"
};

export const TRANSACTION_STATUS_LABELS = {
  pending: "Ожидает",
  confirmed: "Подтверждено",
  cancelled: "Отменено"
};

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role || "—";
}

export function getTransactionTypeLabel(type) {
  return TRANSACTION_TYPE_LABELS[type] || type || "—";
}

export function getTransactionStatusLabel(status) {
  return TRANSACTION_STATUS_LABELS[status] || status || "—";
}
