require("dotenv").config();
console.log("GMAIL_USER:", JSON.stringify(process.env.GMAIL_USER));
console.log("GMAIL_PASS length:", process.env.GMAIL_PASS?.length);
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_change_this";

app.use(cors());
app.use(express.json());

// Auth routes (public)
const authRoutes = require("./routes/authRoutes");
app.use("/auth", authRoutes);

/* ─────────────────────────────────────────
   JWT MIDDLEWARE — protects all routes below
   Attaches req.user = { id, username, is_admin }
───────────────────────────────────────── */
const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    // fetch is_admin from DB (not stored in token so it stays current)
    const result = await pool.query("SELECT id, username, is_admin FROM users WHERE id = $1", [decoded.id]);
    if (result.rows.length === 0) return res.status(401).json({ error: "User not found" });
    req.user = result.rows[0];
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

app.use(authenticate);

/* ─────────────────────────────────────────
   PROGRAMS ROUTES (user-defined, scoped per user)
───────────────────────────────────────── */

/* GET programs — admin sees all, others see own */
app.get("/programs", async (req, res) => {
  try {
    const filter = req.user.is_admin ? "" : "WHERE created_by = $1";
    const params = req.user.is_admin ? [] : [req.user.id];
    const result = await pool.query(
      `SELECT * FROM programs ${filter} ORDER BY school, name ASC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* CREATE a program */
app.post("/programs", async (req, res) => {
  const { name, school } = req.body;
  if (!name || !school) return res.status(400).json({ error: "name and school are required" });
  try {
    const result = await pool.query(
      `INSERT INTO programs (name, school, created_by) VALUES ($1, $2, $3)
       ON CONFLICT (name, created_by) DO NOTHING RETURNING *`,
      [name, school, req.user.id]
    );
    if (result.rows.length === 0) return res.status(409).json({ error: "Program already exists" });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* DELETE a program */
app.delete("/programs/:id", async (req, res) => {
  try {
    const ownerCheck = await pool.query("SELECT created_by FROM programs WHERE id = $1", [req.params.id]);
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: "Program not found" });
    if (!req.user.is_admin && ownerCheck.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await pool.query("DELETE FROM programs WHERE id = $1", [req.params.id]);
    res.json({ message: "Program deleted" });
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* ─────────────────────────────────────────
   STUDENT ROUTES
───────────────────────────────────────── */

/* GET STUDENTS — scoped by user (admin sees all) */
app.get("/students", async (req, res) => {
  try {
    const filter = req.user.is_admin ? "" : "WHERE s.created_by = $1";
    const params = req.user.is_admin ? [] : [req.user.id];
    const result = await pool.query(
      `SELECT s.*,
              COALESCE(
                json_agg(json_build_object('course_name', sc.course_name, 'course_code', sc.course_code))
                  FILTER (WHERE sc.course_name IS NOT NULL),
                '[]'
              ) AS courses
       FROM students s
       LEFT JOIN student_courses sc ON sc.student_id = s.id
       ${filter}
       GROUP BY s.id
       ORDER BY s.student_name ASC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error("GET /students - ERROR:", error.message);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* GET STUDENTS GROUPED BY PROGRAM — scoped by user */
app.get("/students/grouped", async (req, res) => {
  try {
    const filter = req.user.is_admin ? "" : "WHERE s.created_by = $1";
    const params = req.user.is_admin ? [] : [req.user.id];
    const result = await pool.query(
      `SELECT s.*,
              COALESCE(
                json_agg(json_build_object('course_name', sc.course_name, 'course_code', sc.course_code))
                  FILTER (WHERE sc.course_name IS NOT NULL),
                '[]'
              ) AS courses
       FROM students s
       LEFT JOIN student_courses sc ON sc.student_id = s.id
       ${filter}
       GROUP BY s.id
       ORDER BY s.student_name ASC`,
      params
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

/* ADD STUDENT — now with program, year, semester, and multiple courses (name + code) */
app.post("/students", async (req, res) => {
  const { student_name, student_id, year_of_study, semester, program, courses } = req.body;
  // courses: [{ course_name, course_code }, ...]

  if (!student_name || !student_id || !program || !Array.isArray(courses) || courses.length === 0) {
    return res.status(400).json({ error: "student_name, student_id, program, and at least one course are required" });
  }
  if (courses.some((c) => !c.course_name || !c.course_code)) {
    return res.status(400).json({ error: "Each course needs both a name and a code" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const studentResult = await client.query(
      `INSERT INTO students (student_name, student_id, course, year_of_study, semester, program, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [student_name, student_id, courses[0].course_name, year_of_study || null, semester || null, program, req.user.id]
    );
    const newId = studentResult.rows[0].id;

    for (const { course_name, course_code } of courses) {
      await client.query(
        `INSERT INTO student_courses (student_id, course_name, course_code) VALUES ($1, $2, $3)
         ON CONFLICT (student_id, course_code) DO NOTHING`,
        [newId, course_name, course_code]
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

/* ADD A COURSE to an existing student */
app.post("/students/:id/courses", async (req, res) => {
  const { id } = req.params;
  const { course_name, course_code } = req.body;
  if (!course_name || !course_code) {
    return res.status(400).json({ error: "course_name and course_code are required" });
  }
  try {
    await pool.query(
      `INSERT INTO student_courses (student_id, course_name, course_code)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, course_code) DO NOTHING`,
      [id, course_name, course_code.toUpperCase()]
    );
    res.json({ message: "Course added" });
  } catch (error) {
    console.error("POST /students/:id/courses - ERROR:", error.message);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* REMOVE a student from one course by code */
app.delete("/students/:id/courses/:courseCode", async (req, res) => {
  try {
    const { id, courseCode } = req.params;
    await pool.query(
      "DELETE FROM student_courses WHERE student_id = $1 AND course_code = $2",
      [id, courseCode]
    );
    res.json({ message: "Removed from course" });
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* GET all attendance tables — scoped by user (admin sees all) */
app.get("/tables", async (req, res) => {
  try {
    const filter = req.user.is_admin ? "" : "WHERE created_by = $1";
    const params = req.user.is_admin ? [] : [req.user.id];
    const result = await pool.query(
      `SELECT * FROM attendance_tables ${filter} ORDER BY created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error("GET /tables - ERROR:", error.message);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

/* CREATE a new attendance table for a course, scoped by program+code
   (so e.g. Cyber Security's BSE3350 and Software Engineering's BSE3350
   are two completely separate tables) */
app.post("/tables", async (req, res) => {
  const { school, program, course, course_code, created_by } = req.body;
  if (!school || !program || !course || !course_code) {
    return res.status(400).json({ error: "school, program, course, and course_code are required" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO attendance_tables (school, program, course, course_code, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (program, course_code) DO UPDATE SET course = EXCLUDED.course
       RETURNING *`,
      [school, program, course, course_code, req.user.id]
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

/* GET students enrolled in a table's course — matched by program AND course_code,
   so only students of the SAME program doing that exact course code appear */
app.get("/tables/:id/students", async (req, res) => {
  try {
    const tableResult = await pool.query("SELECT * FROM attendance_tables WHERE id = $1", [req.params.id]);
    if (tableResult.rows.length === 0) return res.status(404).json({ error: "Table not found" });
    const { program, course_code } = tableResult.rows[0];

    const studentsResult = await pool.query(
      `SELECT s.* FROM students s
       JOIN student_courses sc ON sc.student_id = s.id
       WHERE sc.course_code = $1 AND s.program = $2
       ORDER BY s.student_name ASC`,
      [course_code, program]
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

    const tableResult = await pool.query("SELECT program, course_code FROM attendance_tables WHERE id = $1", [table_id]);
    if (tableResult.rows.length === 0) return res.status(404).json({ error: "Table not found" });
    const { program, course_code } = tableResult.rows[0];

    const result = await pool.query(
      `SELECT
         s.id              AS student_id,
         s.student_name,
         sc.course_name    AS course,
         COUNT(a.id)                                          AS total_days,
         COUNT(a.id) FILTER (WHERE a.status = 'present')     AS present_days,
         COUNT(a.id) FILTER (WHERE a.status = 'absent')      AS absent_days,
         ROUND(
           COUNT(a.id) FILTER (WHERE a.status = 'present')::numeric
           / NULLIF(COUNT(a.id), 0) * 100, 1
         )                                                    AS percentage
       FROM students s
       JOIN student_courses sc ON sc.student_id = s.id AND sc.course_code = $3 AND s.program = $5
       LEFT JOIN attendance a
         ON a.student_id = s.id
         AND a.table_id = $1
         AND a.date >= $2
         AND a.date <= $4
       GROUP BY s.id, s.student_name, sc.course_name
       ORDER BY s.student_name ASC`,
      [table_id, start, course_code, end, program]
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
