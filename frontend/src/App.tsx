import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getSession } from "./api/client";
import LoginPage from "./pages/LoginPage";
import HQDashboard from "./pages/HQDashboard";
import HQClaimDetail from "./pages/HQClaimDetail";
import HQReportViewer from "./pages/HQReportViewer";
import AdjusterClaimsList from "./pages/AdjusterClaimsList";
import AdjusterClaimDetail from "./pages/AdjusterClaimDetail";

// XR routes are lazy-loaded so Three.js / IWSDK bundles don't load on desktop.
// InspectApp is the MR entry point for adjuster (UC-01 → UC-04).
const InspectApp = lazy(() => import("./pages/InspectApp"));
// ReviewApp is the VR entry point for HQ (UC-07) — Phase 5.
// const ReviewApp = lazy(() => import("./pages/ReviewApp"));

function RootRedirect() {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  return session.user.role === "hq"
    ? <Navigate to="/dashboard" replace />
    : <Navigate to="/claims" replace />;
}

// Simple fullscreen loading screen while XR bundle loads.
function XRLoading() {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#0a0a0f",
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 12, color: "rgba(255,255,255,0.4)",
      fontFamily: "-apple-system, sans-serif", fontSize: 15,
    }}>
      <svg className="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.12)" strokeWidth="3"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
      </svg>
      Loading XR environment…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        {/* HQ Web App */}
        <Route path="/dashboard" element={<HQDashboard />} />
        <Route path="/dashboard/claims/:id" element={<HQClaimDetail />} />
        <Route path="/dashboard/claims/:id/report" element={<HQReportViewer />} />

        {/* Adjuster Web App */}
        <Route path="/claims" element={<AdjusterClaimsList />} />
        <Route path="/claims/:id" element={<AdjusterClaimDetail />} />

        {/* MR App — lazy, handles its own auth check */}
        <Route
          path="/inspect/:claimId"
          element={
            <Suspense fallback={<XRLoading />}>
              <InspectApp />
            </Suspense>
          }
        />

        {/* Phase 5: VR App */}
        {/* <Route path="/review/:claimId" element={<Suspense fallback={<XRLoading />}><ReviewApp /></Suspense>} /> */}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}