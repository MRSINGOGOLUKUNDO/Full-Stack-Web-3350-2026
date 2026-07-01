import { useEffect, useState } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";
import { API_BASE_URL } from "../config";
import { ALL_PROGRAMS } from "../constants/programs";

const API = `${API_BASE_URL}/students`;

/* Live Lusaka clock — updates every second */
function LusakaClock() {
  const [now, setNow] = useState("");

  useEffect(() => {
    const tick = () => {
      const formatted = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Lusaka",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date());
      setNow(formatted);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return <div className="lusaka-clock">🕐 Lusaka: {now}</div>;
}

function Home() {
  const [grouped, setGrouped] = useState({});
  const [openProgram, setOpenProgram] = useState(null);

  // form state
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("1");
  const [semester, setSemester] = useState("1");
  const [program, setProgram] = useState(ALL_PROGRAMS[0]);
  const [courseNameInput, setCourseNameInput] = useState("");
  const [courseCodeInput, setCourseCodeInput] = useState("");
  const [courses, setCourses] = useState([]); // [{ course_name, course_code }, ...]

  const fetchGrouped = async () => {
    try {
      const res = await axios.get(`${API}/grouped`);
      setGrouped(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchGrouped(); }, []);

  const addCourse = () => {
    const name = courseNameInput.trim();
    const code = courseCodeInput.trim().toUpperCase();
    if (!name || !code) {
      alert("Enter both a course name and a course code.");
      return;
    }
    if (courses.some((c) => c.course_code === code)) {
      alert("That course code is already added.");
      return;
    }
    setCourses([...courses, { course_name: name, course_code: code }]);
    setCourseNameInput(""); setCourseCodeInput("");
  };

  const removeCourse = (code) => setCourses(courses.filter((c) => c.course_code !== code));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (courses.length === 0) {
      alert("Add at least one course for this student.");
      return;
    }
    try {
      await axios.post(API, {
        student_name: studentName,
        student_id: studentId,
        year_of_study: Number(yearOfStudy),
        semester: Number(semester),
        program,
        courses,
      });
      setStudentName(""); setStudentId(""); setCourses([]); setCourseNameInput(""); setCourseCodeInput("");
      await fetchGrouped();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Could not add student.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this student completely?")) return;
    try {
      await axios.delete(`${API}/${id}`);
      await fetchGrouped();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container" style={{ position: "relative" }}>
      <Navbar />

      <h1 className="comic-text">Classroom Management System</h1>
      <LusakaClock />

      {/* REGISTRATION FORM */}
      <form onSubmit={handleSubmit} className="reg-form">
        <input
          type="text" placeholder="Student Name" value={studentName}
          onChange={(e) => setStudentName(e.target.value)} required
        />
        <input
          type="text" placeholder="Student ID" value={studentId}
          onChange={(e) => setStudentId(e.target.value)} required
        />

        <select value={yearOfStudy} onChange={(e) => setYearOfStudy(e.target.value)}>
          {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
        </select>

        <select value={semester} onChange={(e) => setSemester(e.target.value)}>
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
        </select>

        <select value={program} onChange={(e) => setProgram(e.target.value)}>
          {ALL_PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Course multi-add */}
        <div className="course-add-row">
          <input
            type="text" placeholder="Course code (e.g. BSE3350)" value={courseCodeInput}
            onChange={(e) => setCourseCodeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCourse(); } }}
          />
          <input
            type="text" placeholder="Course name (e.g. Data Structures)" value={courseNameInput}
            onChange={(e) => setCourseNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCourse(); } }}
          />
          <button type="button" onClick={addCourse}>+ Add Course</button>
        </div>
        {courses.length > 0 && (
          <div className="course-chip-row">
            {courses.map((c) => (
              <span key={c.course_code} className="course-chip" onClick={() => removeCourse(c.course_code)}>
                {c.course_code} — {c.course_name} ✕
              </span>
            ))}
          </div>
        )}

        <button type="submit" className="register-btn">Register Student</button>
      </form>

      {/* PROGRAM CARDS */}
      <div className="program-grid">
        {ALL_PROGRAMS.map((p) => {
          const studentsInProgram = grouped[p] || [];
          const isOpen = openProgram === p;
          return (
            <div key={p} className="program-block">
              <button
                className="program-card"
                onClick={() => setOpenProgram(isOpen ? null : p)}
              >
                {p} <span className="program-count">({studentsInProgram.length})</span>
              </button>

              {isOpen && (
                <div className="program-table-wrap">
                  {studentsInProgram.length === 0 ? (
                    <p className="no-students-msg">No students registered yet.</p>
                  ) : (
                    <table className="program-table">
                      <thead>
                        <tr>
                          <th>Student Name</th>
                          <th>Year</th>
                          <th>Semester</th>
                          <th>Program</th>
                          <th>Course</th>
                          <th>Student ID</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentsInProgram.map((s, i) => (
                          <tr key={s.id} style={{ animationDelay: `${i * (3500 / studentsInProgram.length)}ms` }}>
                            <td>{s.student_name}</td>
                            <td>{s.year_of_study ?? "—"}</td>
                            <td>{s.semester ?? "—"}</td>
                            <td>{s.program ?? "—"}</td>
                            <td>
                              <select defaultValue={s.courses?.[0]?.course_code}>
                                {(s.courses || []).map((c) => (
                                  <option key={c.course_code} value={c.course_code}>
                                    {c.course_code} — {c.course_name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>{s.student_id}</td>
                            <td>
                              <button className="delete-btn" onClick={() => handleDelete(s.id)}>🗑</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .lusaka-clock {
          text-align: left;
          font-size: 14px;
          color: #fff;
          background: rgba(0,0,0,0.5);
          display: inline-block;
          padding: 6px 14px;
          border-radius: 8px;
          margin: -10px 0 24px;
          font-family: Arial, sans-serif;
        }

        .reg-form {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          background: rgba(255,255,255,0.07);
          padding: 20px;
          border-radius: 14px;
          margin-bottom: 30px;
        }
        .reg-form input, .reg-form select {
          padding: 10px 12px;
          border-radius: 8px;
          border: none;
          font-size: 14px;
        }
        .course-add-row { display: flex; gap: 8px; }
        .course-add-row button {
          padding: 8px 14px; border: none; border-radius: 8px;
          background: #FFD700; color: #000; font-weight: bold; cursor: pointer;
        }
        .course-chip-row { display: flex; gap: 8px; flex-wrap: wrap; width: 100%; }
        .course-chip {
          background: #2d6ad0; color: #fff; padding: 6px 10px;
          border-radius: 20px; font-size: 12px; cursor: pointer;
        }
        .register-btn {
          padding: 12px 24px; border: none; border-radius: 10px;
          background: linear-gradient(135deg, #002b5c, #00111f);
          color: #fff; font-weight: bold; cursor: pointer;
        }

        .program-grid {
          display: flex; flex-direction: column; gap: 14px; margin-top: 20px;
        }
        .program-card {
          width: 100%; text-align: left; padding: 16px 22px;
          border: none; border-radius: 12px; cursor: pointer;
          font-weight: bold; font-size: 15px; color: #fff;
          background: linear-gradient(270deg, #001f3f, #003366, #00050d, #001f3f);
          background-size: 400% 400%;
          animation: navyMove 9s ease infinite;
          box-shadow: 0 4px 14px rgba(0,0,0,0.4);
        }
        @keyframes navyMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .program-count { opacity: 0.75; font-weight: normal; }

        .program-table-wrap { margin-top: 8px; overflow-x: auto; }
        .no-students-msg { color: #fff; opacity: 0.7; font-style: italic; padding: 10px; }

        .program-table {
          width: 100%; border-collapse: collapse;
          background: #fff; border-radius: 10px; overflow: hidden;
        }
        .program-table thead tr { background: #1e3a8a; }
        .program-table th {
          color: #fff; padding: 12px; text-align: left; font-size: 13px;
        }
        .program-table td {
          color: #000; padding: 10px 12px; border-bottom: 1px solid #ddd; font-size: 13px;
        }
        .program-table tbody tr {
          opacity: 0;
          animation: rowIn 0.5s ease forwards;
        }
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(-14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .delete-btn {
          background: #e74c3c; border: none; color: #fff;
          border-radius: 6px; padding: 4px 8px; cursor: pointer;
        }
      `}</style>
    </div>
  );
}

export default Home;
