import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, setSession, ApiError } from "../api/client";

// ─── Icons ───────────────────────────────────────────────────────────────────

function ShieldIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2L3 6v6c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V6L12 2z"
        fill="white"
        fillOpacity="0.9"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="#2563EB"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        stroke="#9CA3AF"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="7"
        r="4"
        stroke="#9CA3AF"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="3"
        y="11"
        width="18"
        height="11"
        rx="2"
        ry="2"
        stroke="#9CA3AF"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 11V7a5 5 0 0 1 10 0v4"
        stroke="#9CA3AF"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="animate-spin"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="white"
        strokeOpacity="0.3"
        strokeWidth="3"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const session = await authApi.login(email, password);
      setSession(session);

      // Redirect based on role — FR-MR-01.4 and FR-MR-01.5
      if (session.user.role === "hq") {
        navigate("/dashboard");
      } else {
        navigate("/claims");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid email or password.");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Error: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      {/* ── Gradient background ── */}
      <div className="login-bg" />

      {/* ── Card ── */}
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <ShieldIcon />
        </div>

        {/* Heading */}
        <h1 className="login-title">TwinCheck</h1>
        <p className="login-subtitle">Mixed Reality Assessment System</p>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {/* Email field */}
          <div className="login-field">
            <label className="login-label" htmlFor="email">
              Email
            </label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <PersonIcon />
              </span>
              <input
                id="email"
                type="email"
                className="login-input"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Password field */}
          <div className="login-field">
            <label className="login-label" htmlFor="password">
              Password
            </label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <LockIcon />
              </span>
              <input
                id="password"
                type="password"
                className="login-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            className="login-btn"
            disabled={loading || !email || !password}
          >
            {loading ? (
              <span className="login-btn-loading">
                <SpinnerIcon />
                <span>Signing in…</span>
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {/* Demo hint */}
        <p className="login-demo-hint">
          Demo credentials: any email/password
        </p>
      </div>

      <style>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          font-family: -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif;
        }

        .login-bg {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 35%, #3730a3 100%);
          z-index: 0;
        }

        /* Subtle radial highlight to add depth, matching the design's gradient feel */
        .login-bg::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,132,255,0.25) 0%, transparent 70%);
        }

        .login-card {
          position: relative;
          z-index: 1;
          background: #ffffff;
          border-radius: 20px;
          padding: 48px 48px 36px;
          width: 100%;
          max-width: 520px;
          margin: 24px;
          box-shadow:
            0 4px 6px -1px rgba(0,0,0,0.1),
            0 20px 60px -10px rgba(0,0,0,0.25),
            0 0 0 1px rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .login-logo {
          width: 60px;
          height: 60px;
          background: #2563eb;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          box-shadow: 0 4px 14px rgba(37,99,235,0.45);
        }

        .login-title {
          font-size: 28px;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.5px;
          margin: 0 0 6px;
          line-height: 1;
        }

        .login-subtitle {
          font-size: 14px;
          color: #6B7280;
          margin: 0 0 36px;
          letter-spacing: 0.01em;
        }

        .login-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .login-label {
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          letter-spacing: 0.01em;
        }

        .login-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .login-input-icon {
          position: absolute;
          left: 14px;
          display: flex;
          align-items: center;
          pointer-events: none;
          z-index: 1;
        }

        .login-input {
          width: 100%;
          height: 52px;
          padding: 0 16px 0 44px;
          border: 1.5px solid #E5E7EB;
          border-radius: 10px;
          font-size: 15px;
          color: #111827;
          background: #fff;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          box-sizing: border-box;
          font-family: inherit;
        }

        .login-input::placeholder {
          color: #9CA3AF;
        }

        .login-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }

        .login-input:disabled {
          background: #F9FAFB;
          cursor: not-allowed;
        }

        .login-error {
          background: #FEF2F2;
          border: 1px solid #FECACA;
          color: #DC2626;
          font-size: 13.5px;
          padding: 10px 14px;
          border-radius: 8px;
          text-align: center;
          line-height: 1.4;
        }

        .login-btn {
          height: 52px;
          background: #2563eb;
          color: #fff;
          font-size: 16px;
          font-weight: 600;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
          box-shadow: 0 2px 8px rgba(37,99,235,0.35);
          font-family: inherit;
          letter-spacing: 0.01em;
          margin-top: 4px;
        }

        .login-btn:hover:not(:disabled) {
          background: #1d4ed8;
          box-shadow: 0 4px 14px rgba(37,99,235,0.45);
          transform: translateY(-1px);
        }

        .login-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 6px rgba(37,99,235,0.3);
        }

        .login-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .login-btn-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .login-demo-hint {
          font-size: 13px;
          color: #9CA3AF;
          margin: 28px 0 0;
          text-align: center;
        }

        @media (max-width: 580px) {
          .login-card {
            padding: 36px 28px 28px;
          }
        }
      `}</style>
    </div>
  );
}
