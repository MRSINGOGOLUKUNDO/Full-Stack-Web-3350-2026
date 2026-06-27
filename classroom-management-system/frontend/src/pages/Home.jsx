import { useEffect, useState } from "react";
import axios from "axios";

import Navbar from "../components/Navbar";
import { API_BASE_URL } from "../config";

function Home() {

  const [students, setStudents] = useState([]);

  const [studentName, setStudentName] = useState("");

  const [studentId, setStudentId] = useState("");

  const [course, setCourse] = useState("");

  const [searchTerm, setSearchTerm] = useState("");

  
  const API = `${API_BASE_URL}/students`;

  // LOAD STUDENTS
  useEffect(() => {

    const fetchStudents = async () => {

      try {

        const response = await axios.get(API);

        setStudents(response.data);

      } catch (error) {

        console.log(error);
      }
    };

    fetchStudents();

  }, []);

  // SEARCH — fixed: was using wrong class names in JSX
  const filteredStudents = students.filter((student) =>

    student.student_name
      ?.toLowerCase()
      .includes(searchTerm.toLowerCase())

  );

  // ADD STUDENT
  const handleSubmit = async (e) => {

    e.preventDefault();

    try {

      await axios.post(API, {

        student_name: studentName,
        student_id: studentId,
        course: course,

      });

      setStudentName("");
      setStudentId("");
      setCourse("");

      // Refetch students so the list updates immediately
      const response = await axios.get(API);

      setStudents(response.data);

    } catch (error) {

      console.log(error);
    }
  };

  return (

    <div className="container" style={{ position: "relative" }}>

      <Navbar />

      <h1 className="comic-text">
        Classroom Management System
      </h1>

      {/* SEARCH — fixed class names to match App.css */}
      <div className="search-section">

        <input
          type="text"
          placeholder="Search Student..."
          value={searchTerm}
          onChange={(e) =>
            setSearchTerm(e.target.value)
          }
        />

        {/* LIVE RESULTS — fixed class names to match App.css */}
        {searchTerm && (

          <div className="search-results">

            {filteredStudents.length > 0 ? (

              filteredStudents.map((student) => (

                <div
                  key={student.id}
                  className="search-item"
                >
                  {student.student_name}
                </div>

              ))

            ) : (

              <div className="search-item">
                No students found
              </div>

            )}

          </div>

        )}

      </div>

      {/* FORM */}
      <form
        onSubmit={handleSubmit}
        className="form"
      >

        <input
          type="text"
          placeholder="Student Name"
          value={studentName}
          onChange={(e) =>
            setStudentName(e.target.value)
          }
          required
        />

        <input
          type="text"
          placeholder="Student ID"
          value={studentId}
          onChange={(e) =>
            setStudentId(e.target.value)
          }
          required
        />

        <input
          type="text"
          placeholder="Course"
          value={course}
          onChange={(e) =>
            setCourse(e.target.value)
          }
          required
        />

        <button type="submit">
          Add Student
        </button>

      </form>

      {/* STUDENT LIST */}
      <div className="student-list">

        {students.map((student) => (

          <div
            key={student.id}
            className="student-card"
          >

            <h3>
              {student.student_name}
            </h3>

            <p>
              ID: {student.student_id}
            </p>

            <p>
              Course: {student.course}
            </p>

          </div>

        ))}

      </div>

    </div>
  );
}

export default Home;
