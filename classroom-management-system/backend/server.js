require("dotenv").config();
console.log("GMAIL_USER:", JSON.stringify(process.env.GMAIL_USER));
console.log("GMAIL_PASS length:", process.env.GMAIL_PASS?.length);
const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

// IMPORTANT: cors and json middleware must come BEFORE routes
app.use(cors());
app.use(express.json());

// Auth routes
const authRoutes = require("./routes/authRoutes");
app.use("/auth", authRoutes);

/* ─────────────────────────────────────────
   STUDENT ROUTES
───────────────────────────────────────── */

/* GET STUDENTS */
app.get("/students", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM students ORDER BY student_name ASC"
    );
    res.json(result.rows);
  } catch (error) {
    console.log(error.message);
  }
});

/* ADD STUDENT */
app.post("/students", async (req, res) => {
  try {
    const { student_name, student_id, course } = req.body;
    await pool.query(
      `INSERT INTO students (student_name, student_id, course) VALUES ($1, $2, $3)`,
      [student_name, student_id, course]
    );
    res.json("Student Added");
  } catch (error) {
    console.log(error.message);
  }
});

/* UPDATE STUDENT */
app.put("/students/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { student_name, student_id, course } = req.body;
    await pool.query(
      `UPDATE students SET student_name = $1, student_id = $2, course = $3 WHERE id = $4`,
      [student_name, student_id, course, id]
    );
    res.json("Student Updated");
  } catch (error) {
    console.log(error.message);
  }
});

/* DELETE STUDENT */
app.delete("/students/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM students WHERE id = $1", [id]);
    res.json("Student Deleted");
  } catch (error) {
    console.log(error.message);
  }
});

/* ─────────────────────────────────────────
   ATTENDANCE ROUTES
───────────────────────────────────────── */

/**
 * GET /attendance?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns all attendance records in the given date range.
 * Response: [{ student_id, date, status }, ...]
 */
app.get("/attendance", async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: "start and end query params required" });
    }
    const result = await pool.query(
      `SELECT student_id, to_char(date, 'YYYY-MM-DD') AS date, status
       FROM attendance
       WHERE date >= $1 AND date <= $2
       ORDER BY date ASC`,
      [start, end]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /attendance
 * Save or update a batch of attendance records.
 * Body: { records: [{ student_id, date, status }, ...] }
 * Uses INSERT ... ON CONFLICT to upsert.
 */
app.post("/attendance", async (req, res) => {
  const { records } = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: "records array is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const { student_id, date, status } of records) {
      await client.query(
        `INSERT INTO attendance (student_id, date, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (student_id, date)
         DO UPDATE SET status = EXCLUDED.status`,
        [student_id, date, status]
      );
    }

    await client.query("COMMIT");
    res.json({ message: "Attendance saved", count: records.length });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error.message);
    res.status(500).json({ error: "Failed to save attendance" });
  } finally {
    client.release();
  }
});

/**
 * GET /attendance/report?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns attendance percentage per student for the given date range.
 * Response: [{ student_id, student_name, course, total_days, present_days, absent_days, percentage }, ...]
 */
app.get("/attendance/report", async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: "start and end query params required" });
    }

    const result = await pool.query(
      `SELECT
         s.id              AS student_id,
         s.student_name,
         s.course,
         COUNT(a.id)                                          AS total_days,
         COUNT(a.id) FILTER (WHERE a.status = 'present')     AS present_days,
         COUNT(a.id) FILTER (WHERE a.status = 'absent')      AS absent_days,
         ROUND(
           COUNT(a.id) FILTER (WHERE a.status = 'present')::numeric
           / NULLIF(COUNT(a.id), 0) * 100, 1
         )                                                    AS percentage
       FROM students s
       LEFT JOIN attendance a
         ON a.student_id = s.id
         AND a.date >= $1
         AND a.date <= $2
       GROUP BY s.id, s.student_name, s.course
       ORDER BY s.student_name ASC`,
      [start, end]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
