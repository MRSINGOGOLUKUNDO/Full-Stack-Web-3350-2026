const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_change_this";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Send email via Resend's HTTP API (port 443) instead of SMTP.
// Render's free tier blocks outbound SMTP ports (25, 465, 587) entirely,
// so SMTP-based sending (Nodemailer/Gmail) can never work here regardless
// of code changes. Resend sends over plain HTTPS, which is never blocked.
async function sendEmail({ to, subject, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Classroom Management <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

// POST /auth/register
router.post("/register", async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email)
    return res.status(400).json({ message: "Username, email, and password are required." });
  if (password.length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters." });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return res.status(400).json({ message: "Please enter a valid email address." });

  try {
    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1 OR email = $2",
      [username, email]
    );
    if (existing.rows.length > 0)
      return res.status(409).json({ message: "Username or email already taken." });

    const password_hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)",
      [username, email, password_hash]
    );
    res.status(201).json({ message: "Account created successfully." });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "Username and password are required." });

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials." });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, is_admin: user.is_admin, message: "Login successful." });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// POST /auth/forgot-password
// Always sends reset token to admin email regardless of who requests it.
// Admin then forwards the token manually to the requesting user.
router.post("/forgot-password", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ message: "Username is required." });

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];

    if (!user) return res.json({ message: "If that account exists, the admin has been notified." });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      "UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3",
      [resetToken, expiresAt, user.id]
    );

    // Always send to admin email
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `Password Reset Request — ${username}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
          <h2 style="color: #FFD700;">Password Reset Request</h2>
          <p>User <strong>${username}</strong> has requested a password reset.</p>
          <p>Forward this token to them:</p>
          <div style="background: #f4f4f4; padding: 16px; border-radius: 8px; font-size: 18px; letter-spacing: 2px; font-weight: bold; text-align: center;">
            ${resetToken}
          </div>
          <p style="color: #888; font-size: 13px; margin-top: 16px;">This token expires in <strong>1 hour</strong>.</p>
        </div>
      `,
    });

    res.json({ message: "Reset token sent to admin. Please contact your administrator for your reset token." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Server error. Could not send email." });
  }
});

// POST /auth/reset-password
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword)
    return res.status(400).json({ message: "Token and new password are required." });
  if (newPassword.length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters." });

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()",
      [token]
    );
    const user = result.rows[0];
    if (!user) return res.status(400).json({ message: "Invalid or expired reset token." });

    const password_hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2",
      [password_hash, user.id]
    );

    res.json({ message: "Password reset successfully." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
