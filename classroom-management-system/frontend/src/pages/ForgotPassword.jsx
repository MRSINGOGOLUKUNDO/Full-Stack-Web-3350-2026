import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const API = "http://localhost:5000/auth";

function ForgotPassword() {
  const [step, setStep] = useState("request"); // "request" | "reset"
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequest = async (e) => {
    e.preventDefault();
    setError(""); setMessage("");
    setLoading(true);
    try {
      await axios.post(`${API}/forgot-password`, { email });
      setMessage("Reset link sent! Check your Gmail inbox.");
      setStep("reset");
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError(""); setMessage("");
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/reset-password`, { token, newPassword });
      setMessage("Password reset! You can now log in.");
      setStep("done");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid or expired token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{
        width: "100%", maxWidth: "420px",
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderRadius: "20px", padding: "40px 36px",
        border: "2px solid rgba(255,215,0,0.3)",
        boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
      }}>
        <h1 className="comic-text" style={{ fontSize: "38px", marginBottom: "6px", marginTop: 0 }}>
          {step === "done" ? "All Done!" : "Reset Password"}
        </h1>

        {step === "request" && (
          <>
            <p style={{ color: "rgba(255,255,255,0.55)", margin: "0 0 24px", fontSize: "14px", fontFamily: "Arial, sans-serif" }}>
              Enter the email address linked to your account and we'll send you a reset link.
            </p>
            <form onSubmit={handleRequest} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <input
                type="email" placeholder="Your Gmail address" value={email}
                onChange={(e) => setEmail(e.target.value)}
                required style={inputStyle}
              />
              {error && <p style={errorStyle}>⚠ {error}</p>}
              <SubmitBtn loading={loading} label="Send Reset Link →" />
            </form>
          </>
        )}

        {step === "reset" && (
          <>
            <p style={{ color: "rgba(255,255,255,0.55)", margin: "0 0 24px", fontSize: "14px", fontFamily: "Arial, sans-serif" }}>
              {message && <span style={{ color: "#4ade80" }}>✓ {message}<br /><br /></span>}
              Paste the token from your email and set a new password.
            </p>
            <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <input
                type="text" placeholder="Paste reset token from email" value={token}
                onChange={(e) => setToken(e.target.value)}
                required style={inputStyle}
              />
              <div style={{ position: "relative" }}>
                <input
                  type={showNew ? "text" : "password"} placeholder="New Password" value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingRight: "44px" }}
                />
                <EyeBtn show={showNew} toggle={() => setShowNew(!showNew)} />
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirm ? "text" : "password"} placeholder="Confirm New Password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingRight: "44px" }}
                />
                <EyeBtn show={showConfirm} toggle={() => setShowConfirm(!showConfirm)} />
              </div>
              {error && <p style={errorStyle}>⚠ {error}</p>}
              <SubmitBtn loading={loading} label="Reset Password →" />
            </form>
          </>
        )}

        {step === "done" && (
          <p style={{ color: "#4ade80", fontFamily: "Arial, sans-serif", fontSize: "15px" }}>
            ✓ Your password has been reset successfully.
          </p>
        )}

        <p style={{ textAlign: "center", marginTop: "20px", marginBottom: 0, fontFamily: "Arial, sans-serif", fontSize: "13px" }}>
          <Link to="/login" style={{ color: "#FFD700", textDecoration: "none", opacity: 0.8 }}>
            ← Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}

function EyeBtn({ show, toggle }) {
  return (
    <button type="button" onClick={toggle} style={eyeBtnStyle} tabIndex={-1}>
      {show ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      )}
    </button>
  );
}

function SubmitBtn({ loading, label }) {
  return (
    <button type="submit" disabled={loading} style={{
      padding: "13px", border: "none", borderRadius: "10px",
      background: loading ? "rgba(255,215,0,0.4)" : "#FFD700",
      color: "#000", fontFamily: "'Bangers', cursive", fontSize: "20px",
      letterSpacing: "2px", cursor: loading ? "not-allowed" : "pointer",
      boxShadow: "0 5px 0 #b8960a", transition: "all 0.15s", marginTop: "4px",
    }}>
      {loading ? "Please wait..." : label}
    </button>
  );
}

const inputStyle = {
  padding: "12px 16px", borderRadius: "10px",
  border: "1.5px solid rgba(255,215,0,0.25)",
  background: "rgba(255,255,255,0.08)", color: "white",
  fontSize: "15px", fontFamily: "Arial, sans-serif", outline: "none",
};

const eyeBtnStyle = {
  position: "absolute", right: "12px", top: "50%",
  transform: "translateY(-50%)", background: "none",
  border: "none", cursor: "pointer", color: "rgba(255,215,0,0.7)",
  padding: "4px", display: "flex", alignItems: "center",
};

const errorStyle = { color: "#f87171", fontSize: "13px", margin: 0, fontFamily: "Arial, sans-serif" };

export default ForgotPassword;
