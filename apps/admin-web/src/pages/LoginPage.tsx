import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { brand } from "../config/brand";
import "./LoginPage.css";

const DUMMY_EMAIL = brand.loginDemoEmail;
const DUMMY_PASSWORD = brand.loginDemoPassword;

const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    setTimeout(() => {
      if (email === DUMMY_EMAIL && password === DUMMY_PASSWORD) {
        navigate("/screens");
      } else {
        setError(`Invalid credentials. Try ${DUMMY_EMAIL} / ${DUMMY_PASSWORD}.`);
      }
      setIsSubmitting(false);
    }, 500);
  };

  const handleSocialClick = (provider: string) => {
    console.log(`SSO with ${provider} not implemented yet.`);
  };

  return (
    <div className="login-page">
      <div className="login-page-gradient" />

      <div className="login-page-content">
        <div className="login-card">
          <div className="login-logo-row">
            <div className="login-logo-icon">
              <img src={brand.logoIcon} alt={brand.appName} className="login-logo-image" />
            </div>
            <div className="login-logo-text">
              <span className="login-logo-title">{brand.appName}</span>
              <span className="login-logo-subtitle">{brand.studioName}</span>
            </div>
          </div>

          <h1 className="login-title">Log into {brand.studioName}</h1>
          <p className="login-subtext">
            Don&apos;t have an account? <a href="#">Sign up</a>
          </p>

          <div className="login-social-buttons">
            <button
              type="button"
              className="login-social-button login-social-google"
              onClick={() => handleSocialClick("Google")}
            >
              <span className="login-social-icon login-social-icon-google">G</span>
              <span>Continue with Google</span>
            </button>
            <button
              type="button"
              className="login-social-button login-social-microsoft"
              onClick={() => handleSocialClick("Microsoft")}
            >
              <span className="login-social-icon login-social-icon-microsoft">M</span>
              <span>Continue with Microsoft</span>
            </button>
            <button
              type="button"
              className="login-social-button login-social-linkedin"
              onClick={() => handleSocialClick("LinkedIn")}
            >
              <span className="login-social-icon login-social-icon-linkedin">in</span>
              <span>Continue with LinkedIn</span>
            </button>
          </div>

          <div className="login-divider">
            <span className="login-divider-line" />
            <span className="login-divider-text">or</span>
            <span className="login-divider-line" />
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-field">
              <span className="login-field-label">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </label>

            <label className="login-field">
              <span className="login-field-label">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </label>

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="login-submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in…" : "Continue with email"}
            </button>
          </form>

          <button
            type="button"
            className="login-sso-button"
            onClick={() => handleSocialClick("SSO")}
          >
            Continue with SSO
          </button>
        </div>

        <div className="login-feature">
          <div className="login-feature-card">
            <div className="login-feature-badge">Feature Highlight</div>

            <div className="login-feature-image">
              <div className="login-feature-window">
                <div className="login-feature-window-header">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <span className="login-feature-window-title">
                    {brand.appName} Screens Manager
                  </span>
                </div>
                <div className="login-feature-window-body">
                  <div className="login-feature-window-sidebar" />
                  <div className="login-feature-window-content">
                    <div className="login-feature-window-row header" />
                    <div className="login-feature-window-row" />
                    <div className="login-feature-window-row" />
                    <div className="login-feature-window-row" />
                  </div>
                </div>
              </div>
            </div>

            <div className="login-feature-text-block">
              <h2 className="login-feature-title">Full RDM in Screens Manager</h2>
              <p className="login-feature-text">
                Manage all your {brand.appName} screens and the devices that power them
                from a single, intuitive dashboard. Control content, playlists and
                status in real time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;