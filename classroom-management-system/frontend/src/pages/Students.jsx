import { useEffect, useState } from "react";
import axios from "axios";

import Navbar from "../components/Navbar";

function Students() {

  const [students, setStudents] = useState([]);

  // Track attendance state: { [studentId]: { Mon: "present"|"absent"|null, ... } }
  const [attendance, setAttendance] = useState({});

  const API = "http://localhost:5000/students";

  useEffect(() => {

    const loadStudents = async () => {

      try {

        const response = await axios.get(API);

        setStudents(response.data);

      } catch (error) {

        console.log(error);
      }
    };

    loadStudents();

  }, []);

  // Mark attendance for a student on a given day
  const markAttendance = (studentId, day, status) => {

    setAttendance((prev) => ({

      ...prev,

      [studentId]: {
        ...prev[studentId],
        [day]: status,
      },

    }));
  };

  // Get background colour for a cell based on attendance status
  const getCellStyle = (studentId, day) => {

    const status = attendance[studentId]?.[day];

    if (status === "present") return { backgroundColor: "#c8f7c5" };

    if (status === "absent") return { backgroundColor: "#f7c5c5" };

    return {};
  };

  return (

    // Fixed: added missing "table-container" wrapper div that App.css expects
    <div className="container">

      <Navbar />

      <h1 className="comic-text">
        Student Attendance
      </h1>

      <div className="table-container">

        <table className="attendance-table">

          <thead>

            <tr>

              <th>Name</th>

              <th>Mon</th>

              <th>Tue</th>

              <th>Wed</th>

              <th>Thu</th>

              <th>Fri</th>

            </tr>

          </thead>

          <tbody>

            {students.map((student) => (

              <tr key={student.id}>

                <td>{student.student_name}</td>

                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (

                  <td key={day} style={getCellStyle(student.id, day)}>

                    <button
                      onClick={() =>
                        markAttendance(student.id, day, "present")
                      }
                    >
                      ✅
                    </button>

                    <button
                      onClick={() =>
                        markAttendance(student.id, day, "absent")
                      }
                    >
                      ❌
                    </button>

                  </td>

                ))}

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export default Students;
