require("dotenv").config();
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

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
