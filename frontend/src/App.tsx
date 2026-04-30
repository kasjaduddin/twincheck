import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getSession } from "./api/client";
import LoginPage from "./pages/LoginPage";
// Pages added as each phase is implemented:
import HQDashboard from "./pages/HQDashboard";
import HQClaimDetail from "./pages/HQClaimDetail";
import HQReportViewer from "./pages/HQReportViewer";
import AdjusterClaimsList from "./pages/AdjusterClaimsList";
import AdjusterClaimDetail from "./pages/AdjusterClaimDetail";

function RootRedirect() {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  return session.user.role === "hq"
    ? <Navigate to="/dashboard" replace />
    : <Navigate to="/claims" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        {/* HQ routes — wired up as pages are implemented */}
        <Route path="/dashboard" element={<HQDashboard />} />
        <Route path="/dashboard/claims/:id" element={<HQClaimDetail />} />
        <Route path="/dashboard/claims/:id/report" element={<HQReportViewer />} />

        {/* Adjuster routes */}
        <Route path="/claims" element={<AdjusterClaimsList />} />
        <Route path="/claims/:id" element={<AdjusterClaimDetail />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}