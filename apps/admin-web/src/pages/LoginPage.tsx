import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { brand } from "../config/brand";
import "./LoginPage.css";

type Mode = "login" | "signup";

function setAccessTokenCookie(token: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `pp_access_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}`;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const title = useMemo(
    () => (mode === "login" ? `Log in to ${brand.appName}` : `Start your 7-day trial`),
    [mode],
  );

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.message || "Login failed");
      }

      if (!data?.accessToken || typeof data.accessToken !== "string") {
        throw new Error("Login succeeded but no access token was returned");
      }

      setAccessTokenCookie(data.accessToken);
      navigate("/screens", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const browserTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          organizationName,
          workspaceName,
          email: signupEmail,
          password: signupPassword,
          timezone: browserTimezone,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.message || "Signup failed");
      }

      if (!data?.accessToken || typeof data.accessToken !== "string") {
        throw new Error("Signup succeeded but no access token was returned");
      }

      setAccessTokenCookie(data.accessToken);
      navigate("/screens", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pp-login-page">
      <div className="pp-login-card">
        <div className="pp-login-brand">
          <img src={brand.logoFull} alt={brand.appName} className="pp-login-logo" />
        </div>

        <h1 className="pp-login-title">{title}</h1>

        {mode === "login" ? (
          <div className="pp-login-subtitle">
            Don&apos;t have an account?{" "}
            <button type="button" className="pp-login-link" onClick={() => setMode("signup")}>
              Sign up
            </button>
          </div>
        ) : (
          <div className="pp-login-subtitle">
            Already have an account?{" "}
            <button type="button" className="pp-login-link" onClick={() => setMode("login")}>
              Log in
            </button>
          </div>
        )}

        <div className="pp-login-oauth">
          <button type="button" className="pp-oauth-btn" disabled title="Phase 2">
            <span className="pp-oauth-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.8-6-6.2s2.7-6.2 6-6.2c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 2.8 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.3-.2-2H12z"
                />
              </svg>
            </span>
            <span>Continue with Google</span>
          </button>

          <button type="button" className="pp-oauth-btn" disabled title="Phase 2">
            <span className="pp-oauth-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
                <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
                <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
                <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
              </svg>
            </span>
            <span>Continue with Microsoft</span>
          </button>
        </div>

        <div className="pp-login-divider">
          <span>or continue with email</span>
        </div>

        {error ? <div className="pp-login-error">{error}</div> : null}

        {mode === "login" ? (
          <form className="pp-login-form" onSubmit={submitLogin}>
            <input
              className="pp-login-input"
              type="email"
              placeholder="Email address"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />

            <input
              className="pp-login-input"
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
            />

            <button type="submit" className="pp-login-primary" disabled={busy}>
              {busy ? "Signing in..." : "Continue with email"}
            </button>
          </form>
        ) : (
          <form className="pp-login-form" onSubmit={submitSignup}>
            <input
              className="pp-login-input"
              type="text"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <input
              className="pp-login-input"
              type="text"
              placeholder="Organization name"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              required
            />

            <input
              className="pp-login-input"
              type="text"
              placeholder="Workspace name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              required
            />

            <input
              className="pp-login-input"
              type="email"
              placeholder="Email address"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              required
            />

            <input
              className="pp-login-input"
              type="password"
              placeholder="Create password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              required
            />

            <button type="submit" className="pp-login-primary" disabled={busy}>
              {busy ? "Creating account..." : "Start 7-day trial"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}