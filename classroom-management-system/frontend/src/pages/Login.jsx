import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";

const API = "http://localhost:5000/auth";

function Login() {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const reset = () => {
    setUsername(""); setEmail(""); setPassword(""); setConfirm("");
    setError(""); setSuccess("");
    setShowPassword(false); setShowConfirm(false);
  };

  const switchMode = (m) => { setMode(m); reset(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");

    if (mode === "register" && password !== confirm) {
      setError("Passwords do not match."); return;
    }
    if (mode === "register" && !email) {
      setError("Email is required."); return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters."); return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const res = await axios.post(`${API}/login`, { username, password });
        localStorage.setItem("token", res.data.token);
        navigate("/");
      } else {
        await axios.post(`${API}/register`, { username, email, password });
        setSuccess("Account created! You can now log in.");
        switchMode("login");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{
        width: "100%", maxWidth: "420px",
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderRadius: "20px", padding: "40px 36px",
        border: "2px solid rgba(255,215,0,0.3)",
        boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
      }}>
        <h1 className="comic-text" style={{ fontSize: "42px", marginBottom: "6px", marginTop: 0 }}>
          {mode === "login" ? "Welcome Back" : "Join Up"}
        </h1>
        <p style={{ color: "rgba(255,255,255,0.55)", margin: "0 0 28px", fontSize: "14px", fontFamily: "Arial, sans-serif" }}>
          {mode === "login" ? "Log in to your classroom account" : "Create your account to get started"}
        </p>

        {/* Tab toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.07)", borderRadius: "10px", padding: "4px", marginBottom: "24px", gap: "4px" }}>
          {["login", "register"].map((m) => (
            <button key={m} onClick={() => switchMode(m)} style={{
              flex: 1, padding: "9px", border: "none", borderRadius: "8px",
              background: mode === m ? "#FFD700" : "transparent",
              color: mode === m ? "#000" : "rgba(255,255,255,0.6)",
              fontFamily: "'Bangers', cursive", fontSize: "17px", letterSpacing: "1px",
              cursor: "pointer", transition: "all 0.25s ease",
              boxShadow: mode === m ? "0 2px 10px rgba(255,215,0,0.35)" : "none",
            }}>
              {m === "login" ? "Login" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <input
            type="text" placeholder="Username" value={username}
            onChange={(e) => setUsername(e.target.value)}
            required autoComplete="username" style={inputStyle}
          />

          {mode === "register" && (
            <input
              type="email" placeholder="Gmail address" value={email}
              onChange={(e) => setEmail(e.target.value)}
              required autoComplete="email" style={inputStyle}
            />
          )}

          {/* Password with eye toggle */}
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              required autoComplete={mode === "login" ? "current-password" : "new-password"}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingRight: "44px" }}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeBtnStyle} tabIndex={-1} aria-label="Toggle password visibility">
              {showPassword ? <EyeOff /> : <EyeOn />}
            </button>
          </div>

          {/* Confirm password with eye toggle */}
          {mode === "register" && (
            <div style={{ position: "relative" }}>
              <input
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm Password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required autoComplete="new-password"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingRight: "44px" }}
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={eyeBtnStyle} tabIndex={-1} aria-label="Toggle confirm password visibility">
                {showConfirm ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          )}

          {error && <p style={{ color: "#f87171", fontSize: "13px", margin: 0, fontFamily: "Arial, sans-serif" }}>⚠ {error}</p>}
          {success && <p style={{ color: "#4ade80", fontSize: "13px", margin: 0, fontFamily: "Arial, sans-serif" }}>✓ {success}</p>}

          <button
            type="submit" disabled={loading}
            style={{
              padding: "13px", border: "none", borderRadius: "10px",
              background: loading ? "rgba(255,215,0,0.4)" : "#FFD700",
              color: "#000", fontFamily: "'Bangers', cursive", fontSize: "20px",
              letterSpacing: "2px", cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 5px 0 #b8960a", transition: "all 0.15s", marginTop: "4px",
            }}
            onMouseEnter={(e) => { if (!loading) e.target.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; }}
            onMouseDown={(e) => { if (!loading) { e.target.style.transform = "translateY(3px)"; e.target.style.boxShadow = "0 2px 0 #b8960a"; }}}
            onMouseUp={(e) => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 5px 0 #b8960a"; }}
          >
            {loading ? "Please wait..." : mode === "login" ? "Login →" : "Create Account →"}
          </button>
        </form>

        {/* Forgot password link */}
        {mode === "login" && (
          <p style={{ textAlign: "center", marginTop: "18px", marginBottom: 0, fontFamily: "Arial, sans-serif", fontSize: "13px" }}>
            <Link to="/forgot-password" style={{ color: "#FFD700", textDecoration: "none", opacity: 0.8 }}>
              Forgot your password?
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

// Eye icons as inline SVG components
function EyeOn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

const inputStyle = {
  padding: "12px 16px", borderRadius: "10px",
  border: "1.5px solid rgba(255,215,0,0.25)",
  background: "rgba(255,255,255,0.08)", color: "white",
  fontSize: "15px", fontFamily: "Arial, sans-serif",
  outline: "none", transition: "border-color 0.2s",
};

const eyeBtnStyle = {
  position: "absolute", right: "12px", top: "50%",
  transform: "translateY(-50%)", background: "none",
  border: "none", cursor: "pointer", color: "rgba(255,215,0,0.7)",
  padding: "4px", display: "flex", alignItems: "center",
};

export default Login;
