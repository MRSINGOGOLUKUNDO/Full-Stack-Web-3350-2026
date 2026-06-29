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

/* GET STUDENTS — flat list (kept for backward compatibility) */
app.get("/students", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*,
              COALESCE(
                array_agg(sc.course_name) FILTER (WHERE sc.course_name IS NOT NULL),
                '{}'
              ) AS courses
       FROM students s
       LEFT JOIN student_courses sc ON sc.student_id = s.id
       GROUP BY s.id
       ORDER BY s.student_name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("GET /students - ERROR:", error.message);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* GET STUDENTS GROUPED BY PROGRAM — powers the Home page program cards */
app.get("/students/grouped", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*,
              COALESCE(
                array_agg(sc.course_name) FILTER (WHERE sc.course_name IS NOT NULL),
                '{}'
              ) AS courses
       FROM students s
       LEFT JOIN student_courses sc ON sc.student_id = s.id
       GROUP BY s.id
       ORDER BY s.student_name ASC`
    );

    const grouped = {};
    for (const student of result.rows) {
      const program = student.program || "Unassigned";
      if (!grouped[program]) grouped[program] = [];
      grouped[program].push(student);
    }
    res.json(grouped);
  } catch (error) {
    console.error("GET /students/grouped - ERROR:", error.message);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* ADD STUDENT — now with program, year, semester, and multiple courses */
app.post("/students", async (req, res) => {
  const { student_name, student_id, year_of_study, semester, program, courses } = req.body;

  if (!student_name || !student_id || !program || !Array.isArray(courses) || courses.length === 0) {
    return res.status(400).json({ error: "student_name, student_id, program, and at least one course are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const studentResult = await client.query(
      `INSERT INTO students (student_name, student_id, course, year_of_study, semester, program)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [student_name, student_id, courses[0], year_of_study || null, semester || null, program]
    );
    const newId = studentResult.rows[0].id;

    for (const courseName of courses) {
      await client.query(
        `INSERT INTO student_courses (student_id, course_name) VALUES ($1, $2)
         ON CONFLICT (student_id, course_name) DO NOTHING`,
        [newId, courseName]
      );
    }

    await client.query("COMMIT");
    res.json({ message: "Student Added", id: newId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST /students - ERROR:", error.message);
    res.status(500).json({ error: "Server error", details: error.message });
  } finally {
    client.release();
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

/* REMOVE a student from one course (keeps the student, removes just this enrollment) */
app.delete("/students/:id/courses/:courseName", async (req, res) => {
  try {
    const { id, courseName } = req.params;
    await pool.query(
      "DELETE FROM student_courses WHERE student_id = $1 AND course_name = $2",
      [id, courseName]
    );
    res.json({ message: "Removed from course" });
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* GET all created attendance tables */
app.get("/tables", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM attendance_tables ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("GET /tables - ERROR:", error.message);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* CREATE a new attendance table for a course (school/program/course) */
app.post("/tables", async (req, res) => {
  const { school, program, course, created_by } = req.body;
  if (!school || !program || !course) {
    return res.status(400).json({ error: "school, program, and course are required" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO attendance_tables (school, program, course, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (course) DO UPDATE SET course = EXCLUDED.course
       RETURNING *`,
      [school, program, course, created_by || null]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("POST /tables - ERROR:", error.message);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* GET one table's details */
app.get("/tables/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM attendance_tables WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Table not found" });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* GET students enrolled in a table's course */
app.get("/tables/:id/students", async (req, res) => {
  try {
    const tableResult = await pool.query("SELECT * FROM attendance_tables WHERE id = $1", [req.params.id]);
    if (tableResult.rows.length === 0) return res.status(404).json({ error: "Table not found" });
    const { course } = tableResult.rows[0];

    const studentsResult = await pool.query(
      `SELECT s.* FROM students s
       JOIN student_courses sc ON sc.student_id = s.id
       WHERE sc.course_name = $1
       ORDER BY s.student_name ASC`,
      [course]
    );
    res.json(studentsResult.rows);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* DELETE a table (and its attendance records, via cascade) */
app.delete("/tables/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM attendance_tables WHERE id = $1", [req.params.id]);
    res.json({ message: "Table deleted" });
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* ─────────────────────────────────────────
   ATTENDANCE ROUTES (scoped to a table_id)
───────────────────────────────────────── */

/**
 * GET /attendance?table_id=1&start=YYYY-MM-DD&end=YYYY-MM-DD
 */
app.get("/attendance", async (req, res) => {
  try {
    const { table_id, start, end } = req.query;
    if (!table_id || !start || !end) {
      return res.status(400).json({ error: "table_id, start, and end query params required" });
    }
    const result = await pool.query(
      `SELECT student_id, to_char(date, 'YYYY-MM-DD') AS date, status
       FROM attendance
       WHERE table_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date ASC`,
      [table_id, start, end]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /attendance
 * Body: { table_id, records: [{ student_id, date, status }, ...] }
 */
app.post("/attendance", async (req, res) => {
  const { table_id, records } = req.body;

  if (!table_id || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: "table_id and a records array are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const { student_id, date, status } of records) {
      await client.query(
        `INSERT INTO attendance (table_id, student_id, date, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (table_id, student_id, date)
         DO UPDATE SET status = EXCLUDED.status`,
        [table_id, student_id, date, status]
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
 * GET /attendance/report?table_id=1&start=YYYY-MM-DD&end=YYYY-MM-DD
 */
app.get("/attendance/report", async (req, res) => {
  try {
    const { table_id, start, end } = req.query;
    if (!table_id || !start || !end) {
      return res.status(400).json({ error: "table_id, start, and end query params required" });
    }

    const tableResult = await pool.query("SELECT course FROM attendance_tables WHERE id = $1", [table_id]);
    if (tableResult.rows.length === 0) return res.status(404).json({ error: "Table not found" });
    const { course } = tableResult.rows[0];

    const result = await pool.query(
      `SELECT
         s.id              AS student_id,
         s.student_name,
         $3::text          AS course,
         COUNT(a.id)                                          AS total_days,
         COUNT(a.id) FILTER (WHERE a.status = 'present')     AS present_days,
         COUNT(a.id) FILTER (WHERE a.status = 'absent')      AS absent_days,
         ROUND(
           COUNT(a.id) FILTER (WHERE a.status = 'present')::numeric
           / NULLIF(COUNT(a.id), 0) * 100, 1
         )                                                    AS percentage
       FROM students s
       JOIN student_courses sc ON sc.student_id = s.id AND sc.course_name = $3
       LEFT JOIN attendance a
         ON a.student_id = s.id
         AND a.table_id = $1
         AND a.date >= $2
         AND a.date <= $4
       GROUP BY s.id, s.student_name
       ORDER BY s.student_name ASC`,
      [table_id, start, course, end]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
