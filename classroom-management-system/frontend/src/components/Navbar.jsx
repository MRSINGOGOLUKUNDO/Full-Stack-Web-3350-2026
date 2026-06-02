import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isLoggedIn = !!localStorage.getItem("token");

  // Shrink navbar on scroll
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Backdrop blur overlay when menu is open on mobile */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 98,
            backdropFilter: "blur(2px)",
          }}
        />
      )}

      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 99,
          height: scrolled ? "56px" : "72px",
          transition: "height 0.35s cubic-bezier(.4,0,.2,1), box-shadow 0.35s",
          background: scrolled
            ? "rgba(10, 10, 20, 0.92)"
            : "rgba(10, 10, 20, 0.75)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: scrolled
            ? "0 4px 32px rgba(0,0,0,0.45), 0 1px 0 rgba(255,220,0,0.18)"
            : "0 2px 16px rgba(0,0,0,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          fontFamily: "'Bangers', cursive",
        }}
      >
        {/* Logo / Brand */}
        <Link
          to="/"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span
            style={{
              fontSize: scrolled ? "22px" : "28px",
              transition: "font-size 0.35s",
              color: "#FFD700",
              textShadow: "2px 2px 0 #c00, 0 0 20px rgba(255,215,0,0.4)",
              letterSpacing: "2px",
              lineHeight: 1,
            }}
          >
            🎓 CMS
          </span>
        </Link>

        {/* Desktop Links */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
          className="nav-desktop-links"
        >
          <NavLink to="/" label="Home" active={isActive("/")} />
          <NavLink to="/students" label="Students" active={isActive("/students")} />

          {isLoggedIn ? (
            <button
              onClick={handleLogout}
              style={logoutBtnStyle}
              onMouseEnter={(e) => {
                e.target.style.background = "#cc0000";
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 6px 20px rgba(255,50,50,0.5)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#e11d48";
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 3px 12px rgba(225,29,72,0.4)";
              }}
            >
              ⏻ Logout
            </button>
          ) : (
            <NavLink to="/login" label="Login" active={isActive("/login")} />
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="nav-hamburger"
          style={{
            background: "none",
            border: "none",
            color: "#FFD700",
            fontSize: "26px",
            cursor: "pointer",
            padding: "4px 8px",
            lineHeight: 1,
            display: "none",
          }}
          aria-label="Toggle menu"
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </nav>

      {/* Mobile dropdown menu */}
      <div
        style={{
          position: "fixed",
          top: scrolled ? "56px" : "72px",
          left: 0,
          right: 0,
          zIndex: 99,
          background: "rgba(10,10,20,0.97)",
          backdropFilter: "blur(16px)",
          transition: "transform 0.3s cubic-bezier(.4,0,.2,1), opacity 0.3s",
          transform: menuOpen ? "translateY(0)" : "translateY(-110%)",
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? "all" : "none",
          display: "flex",
          flexDirection: "column",
          padding: "12px 0 20px",
          borderBottom: "2px solid rgba(255,215,0,0.2)",
        }}
        className="nav-mobile-menu"
      >
        <MobileNavLink to="/" label="🏠 Home" active={isActive("/")} />
        <MobileNavLink to="/students" label="🎓 Students" active={isActive("/students")} />
        {isLoggedIn ? (
          <button
            onClick={handleLogout}
            style={{
              background: "none",
              border: "none",
              color: "#f87171",
              fontFamily: "'Bangers', cursive",
              fontSize: "20px",
              letterSpacing: "1px",
              padding: "14px 28px",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            ⏻ Logout
          </button>
        ) : (
          <MobileNavLink to="/login" label="🔑 Login" active={isActive("/login")} />
        )}
      </div>

      {/* Spacer so page content doesn't go under navbar */}
      <div style={{ height: scrolled ? "56px" : "72px", transition: "height 0.35s" }} />

      <style>{`
        @media (max-width: 640px) {
          .nav-desktop-links { display: none !important; }
          .nav-hamburger { display: block !important; }
        }
        @media (min-width: 641px) {
          .nav-mobile-menu { display: none !important; }
        }
      `}</style>
    </>
  );
}

function NavLink({ to, label, active }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textDecoration: "none",
        color: active ? "#FFD700" : hovered ? "#FFD700" : "rgba(255,255,255,0.82)",
        fontFamily: "'Bangers', cursive",
        fontSize: "18px",
        letterSpacing: "1.5px",
        padding: "6px 14px",
        borderRadius: "8px",
        background: active
          ? "rgba(255,215,0,0.12)"
          : hovered
          ? "rgba(255,215,0,0.07)"
          : "transparent",
        borderBottom: active ? "2px solid #FFD700" : "2px solid transparent",
        transition: "all 0.2s ease",
        textShadow: active ? "0 0 12px rgba(255,215,0,0.5)" : "none",
      }}
    >
      {label}
    </Link>
  );
}

function MobileNavLink({ to, label, active }) {
  return (
    <Link
      to={to}
      style={{
        textDecoration: "none",
        color: active ? "#FFD700" : "rgba(255,255,255,0.85)",
        fontFamily: "'Bangers', cursive",
        fontSize: "20px",
        letterSpacing: "1px",
        padding: "14px 28px",
        borderLeft: active ? "3px solid #FFD700" : "3px solid transparent",
        background: active ? "rgba(255,215,0,0.08)" : "transparent",
        transition: "all 0.2s",
      }}
    >
      {label}
    </Link>
  );
}

const logoutBtnStyle = {
  padding: "7px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#e11d48",
  color: "white",
  fontFamily: "'Bangers', cursive",
  fontSize: "17px",
  letterSpacing: "1px",
  cursor: "pointer",
  boxShadow: "0 3px 12px rgba(225,29,72,0.4)",
  transition: "all 0.2s ease",
};

export default Navbar;
