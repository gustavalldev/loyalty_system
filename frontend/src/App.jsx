import { Routes, Route, Navigate } from "react-router-dom";
import RequireAuth from "./components/RequireAuth.jsx";
import RequireRole from "./components/RequireRole.jsx";
import AuthLayout from "./layouts/AuthLayout.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";
import LoginPage from "./pages/auth/LoginPage.jsx";
import RegisterPage from "./pages/auth/RegisterPage.jsx";
import VerifyOtpPage from "./pages/auth/VerifyOtpPage.jsx";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage.jsx";
import DashboardPage from "./pages/app/DashboardPage.jsx";
import TransactionsPage from "./pages/app/TransactionsPage.jsx";
import ReferralsPage from "./pages/app/ReferralsPage.jsx";
import ProfilePage from "./pages/app/ProfilePage.jsx";
import SecurityPage from "./pages/app/SecurityPage.jsx";
import GuidePage from "./pages/app/GuidePage.jsx";
import AdminUsersPage from "./pages/admin/AdminUsersPage.jsx";
import AdminPromoCodesPage from "./pages/admin/AdminPromoCodesPage.jsx";
import AdminReferralAttributionsPage from "./pages/admin/AdminReferralAttributionsPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthLayout />}>
        <Route index element={<Navigate to="/auth/login" replace />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="reset" element={<ResetPasswordPage />} />
      </Route>

      <Route
        path="/"
        element={(
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        )}
      >
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="referrals" element={<ReferralsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="guide" element={<GuidePage />} />
      </Route>

      <Route
        path="/admin"
        element={(
          <RequireAuth>
            <RequireRole roles={["admin"]}>
              <AdminLayout />
            </RequireRole>
          </RequireAuth>
        )}
      >
        <Route index element={<AdminUsersPage />} />
        <Route path="promo-codes" element={<AdminPromoCodesPage />} />
        <Route path="referrals" element={<AdminReferralAttributionsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  );
}
