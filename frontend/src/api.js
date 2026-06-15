const baseUrl = import.meta.env.VITE_API_URL || "";
let refreshing = null;

const ERROR_MESSAGES = {
  invalid_code: "Неверный код подтверждения",
  expired_code: "Код истёк",
  attempts_exceeded: "Слишком много неверных попыток",
  invalid_credentials: "Неверный логин или пароль",
  invalid_email: "Введите корректный email",
  user_exists: "Пользователь уже существует",
  phone_in_use: "Телефон уже используется",
  delivery_failed: "Не удалось отправить письмо",
  cooldown: "Слишком много запросов",
  referral_already_confirmed: "Покупка уже подтверждена"
};

async function refreshToken() {
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) return null;
  const res = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("refresh_token", data.refresh_token);
  return data.access_token;
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("access_token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  });

  if (res.status === 401) {
    if (!refreshing) {
      refreshing = refreshToken().finally(() => {
        refreshing = null;
      });
    }
    const newToken = await refreshing;
    if (newToken) {
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${newToken}`
      };
      res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: retryHeaders
      });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (!path.startsWith("/auth/change-password") && !path.startsWith("/auth/")) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
    }
  }
  if (!res.ok) {
    let message = ERROR_MESSAGES[data.error] || data.error || "request_failed";
    if (res.status === 429 && data.retry_after) {
      message = `Слишком много запросов. Подождите ${data.retry_after} сек.`;
    } else if (res.status === 400) {
      message = ERROR_MESSAGES[data.error] || "Проверьте введённые данные";
    }
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function apiGet(path) {
  return apiRequest(path, { method: "GET" });
}

export function apiPost(path, body) {
  return apiRequest(path, { method: "POST", body: JSON.stringify(body || {}) });
}

export function apiPatch(path, body) {
  return apiRequest(path, { method: "PATCH", body: JSON.stringify(body || {}) });
}
