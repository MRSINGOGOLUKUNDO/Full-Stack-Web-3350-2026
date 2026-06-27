const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_change_this";

const dns = require("dns");

// Gmail transporter — reads credentials from .env
// Render's network can't reach Gmail over IPv6, so we force IPv4 resolution explicitly
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // STARTTLS on port 587
  auth: {
    user: process.env.GMAIL_USER,   // your Gmail address
    pass: process.env.GMAIL_PASS,   // your Gmail App Password
  },
  lookup: (hostname, options, callback) => {
    dns.lookup(hostname, { family: 4 }, callback);
  },
});

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
    res.json({ token, message: "Login successful." });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// POST /auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required." });

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    // Always respond the same way to avoid revealing if email exists
    if (!user) return res.json({ message: "If that email exists, a reset link has been sent." });

    // Generate a secure random token valid for 1 hour
    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await pool.query(
      "UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3",
      [resetToken, expiresAt, email]
    );

    await transporter.sendMail({
      from: `"Classroom Management" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: "Password Reset Request",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
          <h2 style="color: #FFD700;">Reset Your Password</h2>
          <p>You requested a password reset. Copy the token below and paste it into the reset form:</p>
          <div style="background: #f4f4f4; padding: 16px; border-radius: 8px; font-size: 18px; letter-spacing: 2px; font-weight: bold; text-align: center;">
            ${resetToken}
          </div>
          <p style="color: #888; font-size: 13px; margin-top: 16px;">This token expires in <strong>1 hour</strong>. If you didn't request this, ignore this email.</p>
        </div>
      `,
    });

    res.json({ message: "Reset token sent to your email." });
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
