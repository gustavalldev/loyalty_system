import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiGet } from "../api.js";

export default function RequireRole({ roles, children }) {
  const [state, setState] = useState({ loading: true, ok: false });

  useEffect(() => {
    let active = true;
    apiGet("/me")
      .then((data) => {
        if (!active) return;
        const ok = roles.includes(data.role);
        setState({ loading: false, ok });
      })
      .catch(() => {
        if (!active) return;
        setState({ loading: false, ok: false });
      });
    return () => {
      active = false;
    };
  }, [roles]);

  if (state.loading) {
    return null;
  }
  if (!state.ok) {
    return <Navigate to="/" replace />;
  }
  return children;
}
