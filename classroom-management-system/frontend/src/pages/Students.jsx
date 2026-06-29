import { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

import { API_BASE_URL } from "../config";
import { getSchoolForProgram, ALL_PROGRAMS } from "../constants/programs";
const API = API_BASE_URL;

/* ─── helpers ─────────────────────────────────────────────────────────── */

function getSemesters(year) {
  return [
    { label: `Jan – Jun ${year}`, start: `${year}-01-01`, end: `${year}-06-30` },
    { label: `Jul – Dec ${year}`, start: `${year}-07-01`, end: `${year}-12-31` },
  ];
}

/** Local-timezone-safe date string → parts */
function parseLocalDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d); // month is 0-indexed, NO UTC shift
}

/** Build Mon–Fri dates using local time (fixes the Sunday bug) */
function buildWeekdays(start, end) {
  const days   = [];
  const cursor = parseLocalDate(start);
  const last   = parseLocalDate(end);
  while (cursor <= last) {
    const dow = cursor.getDay(); // local day: 0=Sun,1=Mon…5=Fri,6=Sat
    if (dow >= 1 && dow <= 5) {
      // Format as YYYY-MM-DD without UTC conversion
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      days.push(`${y}-${m}-${d}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Group dates by 'MMM YYYY' using local time */
function groupByMonth(dates) {
  const groups = {};
  for (const d of dates) {
    const dt  = parseLocalDate(d);
    const key = dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    if (!groups[key]) groups[key] = [];
    groups[key].push(d);
  }
  return groups;
}

/** Short day label using local time */
function shortLabel(dateStr) {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

function buildPDF(rows, semesterLabel) {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text(`Attendance Report — ${semesterLabel}`, 14, 18);

  autoTable(doc, {
    startY: 26,
    head: [["Student Name", "Course", "Total Days", "Present", "Absent", "Attendance %"]],
    body: rows.map((r) => [
      r.student_name, r.course, r.total_days, r.present_days, r.absent_days, `${r.percentage ?? "0.0"}%`,
    ]),
    headStyles: { fillColor: [30, 58, 95] },
    styles: { fontSize: 10 },
  });

  return doc;
}

/* ─── component ────────────────────────────────────────────────────────── */

function Students() {
  const currentYear  = new Date().getFullYear();
  const yearOptions  = Array.from({ length: 2057 - 2025 + 1 }, (_, i) => 2025 + i);

  const [selectedYear,   setSelectedYear]   = useState(currentYear);
  const [selectedSemIdx, setSelectedSemIdx] = useState(new Date().getMonth() < 6 ? 0 : 1);

  const semester    = useMemo(() => getSemesters(selectedYear)[selectedSemIdx], [selectedYear, selectedSemIdx]);
  const weekdays    = useMemo(() => buildWeekdays(semester.start, semester.end), [semester]);
  const monthGroups = useMemo(() => groupByMonth(weekdays), [weekdays]);
  const monthKeys   = useMemo(() => Object.keys(monthGroups), [monthGroups]);

  const [students,       setStudents]       = useState([]);
  const [attendance,     setAttendance]     = useState({});
  const [dirty,          setDirty]          = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [saveMsg,        setSaveMsg]        = useState("");
  const [showReport,     setShowReport]     = useState(false);
  const [reportRows,     setReportRows]     = useState([]);
  const [reportLoading,  setReportLoading]  = useState(false);

  /* ── Table (course) selection ── */
  const [tables,        setTables]        = useState([]);
  const [tablesLoaded,  setTablesLoaded]  = useState(false);
  const [activeTable,   setActiveTable]   = useState(null); // full table object {id, school, program, course}
  const [newProgram,    setNewProgram]    = useState(ALL_PROGRAMS[0]);
  const [newCourse,     setNewCourse]     = useState("");
  const [creating,      setCreating]      = useState(false);

  const fetchTables = async () => {
    try {
      const { data } = await axios.get(`${API}/tables`);
      setTables(data);
    } catch (err) { console.error(err); }
    finally { setTablesLoaded(true); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchTables(); }, []);

  const createTable = async (e) => {
    e.preventDefault();
    if (!newCourse.trim()) return;
    setCreating(true);
    try {
      const school = getSchoolForProgram(newProgram);
      const { data } = await axios.post(`${API}/tables`, {
        school, program: newProgram, course: newCourse.trim(),
      });
      setNewCourse("");
      await fetchTables();
      setActiveTable(data);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Could not create table.");
    } finally {
      setCreating(false);
    }
  };

  const deleteTable = async (id) => {
    if (!window.confirm("Delete this entire attendance table? This removes its saved attendance too.")) return;
    try {
      await axios.delete(`${API}/tables/${id}`);
      setActiveTable(null);
      await fetchTables();
    } catch (err) { console.error(err); }
  };

  /* ── Students + attendance for the active table ── */
  useEffect(() => {
    if (!activeTable) return;
    axios.get(`${API}/tables/${activeTable.id}/students`)
      .then((r) => setStudents(r.data))
      .catch(console.error);
  }, [activeTable]);

  useEffect(() => {
    if (!activeTable) return;
    axios.get(`${API}/attendance`, { params: { table_id: activeTable.id, start: semester.start, end: semester.end } })
      .then(({ data }) => {
        const map = {};
        for (const row of data) {
          if (!map[row.student_id]) map[row.student_id] = {};
          map[row.student_id][row.date] = row.status;
        }
        setAttendance(map);
        setDirty(false);
      }).catch(console.error);
  }, [semester, activeTable]);

  const toggle = useCallback((studentId, date) => {
    setAttendance((prev) => {
      const current = prev[studentId]?.[date];
      const next    = current === "present" ? "absent" : current === "absent" ? null : "present";
      const updated = { ...prev[studentId] };
      if (next === null) delete updated[date]; else updated[date] = next;
      return { ...prev, [studentId]: updated };
    });
    setDirty(true);
    setSaveMsg("");
  }, []);

  const saveAttendance = async () => {
    setSaving(true);
    setSaveMsg("");
    const records = [];
    for (const [studentId, dates] of Object.entries(attendance)) {
      for (const [date, status] of Object.entries(dates)) {
        if (date >= semester.start && date <= semester.end) {
          records.push({ student_id: Number(studentId), date, status });
        }
      }
    }
    try {
      await axios.post(`${API}/attendance`, { table_id: activeTable.id, records });
      setDirty(false);
      setSaveMsg(`✓ Saved ${records.length} record${records.length !== 1 ? "s" : ""}`);
    } catch {
      setSaveMsg("✗ Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const openReport = async () => {
    setReportLoading(true);
    setShowReport(true);
    try {
      const { data } = await axios.get(`${API}/attendance/report`, {
        params: { table_id: activeTable.id, start: semester.start, end: semester.end },
      });
      setReportRows(data);
    } catch (err) { console.error(err); }
    finally { setReportLoading(false); }
  };

  const savePDF = async () => {
    const doc = buildPDF(reportRows, semester.label);
    const fileName = `attendance_${semester.label.replace(/\s/g, "_")}.pdf`;

    if (Capacitor.isNativePlatform()) {
      // Inside the Android app: a normal browser download doesn't work in a
      // WebView, so we write the PDF to the device's cache and open the
      // native Share sheet (Save to Files / Drive / WhatsApp / Print, etc.)
      try {
        const dataUri = doc.output("datauristring"); // "data:application/pdf;filename=...;base64,XXXX"
        const base64  = dataUri.split(",").pop();

        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Cache,
        });

        await Share.share({
          title: "Attendance Report",
          url: result.uri,
          dialogTitle: "Save or share your attendance report",
        });
      } catch (err) {
        console.error("PDF share failed:", err);
        setSaveMsg("✗ Could not share PDF.");
      }
    } else {
      // Normal browser (e.g. testing locally on desktop) — just download it
      doc.save(fileName);
    }
  };

  const cellStatus = (sid, date) => attendance[sid]?.[date] ?? null;

  const removeFromCourse = async (studentId, studentName) => {
    if (!window.confirm(`Remove ${studentName} from this course's attendance table?`)) return;
    try {
      await axios.delete(`${API}/students/${studentId}/courses/${encodeURIComponent(activeTable.course)}`);
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
    } catch (err) { console.error(err); }
  };

  const isMonthEnd = (i) =>
    i === weekdays.length - 1 ||
    parseLocalDate(weekdays[i + 1]).getMonth() !== parseLocalDate(weekdays[i]).getMonth();

  return (
    <div className="att-page">
      <Navbar />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bangers&family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap');

        .att-page {
          min-height: 100vh;
          background: #f0f4f8;
          font-family: 'DM Sans', sans-serif;
          padding-bottom: 60px;
        }

        /* ── Page header ── */
        .att-header {
          position: relative;
          overflow: hidden;
          padding: 28px 32px 24px;
          color: #fff;
          margin-bottom: 28px;
          background: linear-gradient(270deg, #1e3a5f, #6a1b9a, #2d6a9f, #1e3a5f);
          background-size: 400% 400%;
          animation: hueMove 10s ease infinite;
        }
        @keyframes hueMove {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .att-header h1 {
          font-family: 'Bangers', cursive;
          font-size: 48px;
          letter-spacing: 1px;
          margin: 0 0 6px;
          color: #ff3b3b;
          text-shadow:
            3px 3px black,
            6px 6px red;
        }
        .att-header p { margin: 0; font-size: 13px; opacity: 0.85; }

        .active-table-meta {
          display: flex; flex-wrap: wrap; gap: 18px; align-items: center;
          font-size: 13px; margin-top: 6px;
        }
        .active-table-meta span { background: rgba(255,255,255,0.12); padding: 6px 12px; border-radius: 8px; }
        .back-to-tables-btn {
          margin-left: auto; padding: 6px 14px; border: none; border-radius: 8px;
          background: #fff; color: #1e3a5f; font-weight: 700; cursor: pointer;
        }

        .tables-landing { padding: 0 4px; }
        .create-table-form {
          background: #fff; border-radius: 14px; padding: 20px 24px; margin-bottom: 24px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }
        .create-table-form h3 { margin: 0 0 12px; color: #1e3a5f; font-size: 16px; }
        .create-table-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .create-table-row select, .create-table-row input {
          padding: 10px 12px; border-radius: 8px; border: 1.5px solid #d1dce8; font-size: 13px;
        }
        .create-table-row input { flex: 1; min-width: 200px; }
        .create-table-row button {
          padding: 10px 20px; border: none; border-radius: 8px;
          background: linear-gradient(270deg, #001f3f, #003366, #00050d, #001f3f);
          background-size: 400% 400%; animation: navyMove2 9s ease infinite;
          color: #fff; font-weight: 700; cursor: pointer;
        }
        @keyframes navyMove2 {
          0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; }
        }
        .school-preview { margin: 10px 0 0; font-size: 12px; color: #64748b; }

        .no-table-msg {
          color: #fff; background: rgba(0,0,0,0.25); padding: 16px 20px;
          border-radius: 10px; font-style: italic;
        }

        .tables-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
        .table-card {
          position: relative; cursor: pointer; padding: 18px 18px 16px;
          border-radius: 12px; color: #fff;
          background: linear-gradient(270deg, #001f3f, #003366, #00050d, #001f3f);
          background-size: 400% 400%; animation: navyMove2 10s ease infinite;
          box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        }
        .table-card-course { font-weight: 800; font-size: 15px; margin-bottom: 6px; }
        .table-card-meta { font-size: 12px; opacity: 0.85; }
        .table-card-school { font-size: 11px; opacity: 0.65; margin-top: 4px; }
        .table-card-delete {
          position: absolute; top: 10px; right: 10px;
          background: rgba(231,76,60,0.85); border: none; color: #fff;
          border-radius: 6px; padding: 3px 7px; cursor: pointer; font-size: 11px;
        }

        /* ── Controls bar ── */
        .att-controls-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          padding: 0 32px 20px;
        }
        .ctrl-group {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fff;
          border: 1.5px solid #d1dce8;
          border-radius: 8px;
          padding: 6px 12px;
        }
        .ctrl-group label {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .ctrl-group select {
          border: none;
          outline: none;
          font-size: 14px;
          font-weight: 600;
          color: #1e3a5f;
          background: transparent;
          cursor: pointer;
        }
        .att-actions { margin-left: auto; display: flex; align-items: center; gap: 10px; }
        .save-msg { font-size: 13px; font-weight: 600; color: #16a34a; }
        .save-msg.err { color: #dc2626; }

        .btn {
          padding: 9px 18px;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.01em;
        }
        .btn-save {
          background: #1e3a5f;
          color: #fff;
        }
        .btn-save:hover   { background: #16304f; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(30,58,95,0.3); }
        .btn-save:disabled { background: #93b4d4; cursor: not-allowed; transform: none; box-shadow: none; }
        .btn-report {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
        }
        .btn-report:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.4); }

        /* ── Legend ── */
        .legend {
          display: flex;
          gap: 18px;
          padding: 0 32px 14px;
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
        }
        .legend-chip {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .legend-swatch {
          width: 14px; height: 14px;
          border-radius: 4px;
          border: 1px solid rgba(0,0,0,0.08);
        }

        /* ── Table wrapper ── */
        .att-scroll-wrap {
          margin: 0 32px;
          overflow-x: auto;
          border-radius: 12px;
          box-shadow: 0 2px 16px rgba(0,0,0,0.08);
          background: #fff;
        }

        .att-table {
          border-collapse: collapse;
          font-size: 11.5px;
          min-width: 700px;
          width: 100%;
        }

        /* Sticky name column */
        .att-table .col-name {
          position: sticky;
          left: 0;
          z-index: 2;
          min-width: 160px;
          max-width: 200px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          padding: 10px 14px;
          border-right: 2px solid #e2e8f0;
        }
        thead .col-name {
          background: #1e3a5f !important;
          color: #fff !important;
          z-index: 4;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 12px;
          letter-spacing: 0.04em;
        }
        tbody tr:nth-child(odd)  .col-name { background: #f8fafc; }
        tbody tr:nth-child(even) .col-name { background: #fff; }

        /* Month header */
        .month-row th {
          background: #1e3a5f;
          color: #93c5fd;
          text-align: center;
          padding: 7px 4px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          border-right: 2px solid #2d4f73;
        }

        /* Day header */
        .day-row th {
          background: #243b55;
          color: #cbd5e1;
          text-align: center;
          padding: 6px 2px;
          min-width: 40px;
          font-weight: 500;
          font-size: 10.5px;
          border-right: 1px solid #2d4f73;
          white-space: nowrap;
        }

        /* Data rows */
        tbody tr:nth-child(odd)  { background: #f8fafc; }
        tbody tr:nth-child(even) { background: #ffffff; }
        tbody tr:hover { background: #eef3f9 !important; }
        tbody tr:hover .col-name { background: #eef3f9 !important; }

        /* Name cell text */
        tbody .col-name {
          font-weight: 600;
          color: #1e3a5f;
          font-size: 13px;
        }

        /* Attendance cell */
        .att-cell {
          text-align: center;
          padding: 0;
          border: 1px solid #e8edf2;
          cursor: pointer;
          min-width: 40px;
          height: 34px;
          font-size: 14px;
          transition: transform 0.1s, opacity 0.1s;
          user-select: none;
        }
        .att-cell:hover { transform: scale(1.15); opacity: 0.85; z-index: 1; position: relative; }
        .att-cell.present { background: #dcfce7; }
        .att-cell.absent  { background: #fee2e2; }
        .att-cell.empty   { background: transparent; color: #cbd5e1; }
        .att-cell.month-end { border-right: 2px solid #b0c4de !important; }
        .delete-btn {
          background: #e74c3c; border: none; color: #fff;
          border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px;
        }

        /* ── Report modal ── */
        .modal-overlay {
          position: fixed; inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 16px;
        }
        .modal-box {
          background: #fff;
          border-radius: 16px;
          padding: 32px;
          max-width: 700px; width: 100%;
          max-height: 88vh; overflow-y: auto;
          box-shadow: 0 24px 64px rgba(0,0,0,0.3);
        }
        .modal-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 20px; color: #1e3a5f; margin: 0 0 3px;
        }
        .modal-sub { font-size: 13px; color: #64748b; margin: 0 0 20px; }
        .modal-actions { display: flex; gap: 10px; margin-bottom: 20px; }
        .btn-outline {
          padding: 8px 16px; border: 1.5px solid #d1dce8;
          border-radius: 8px; background: #fff;
          font-size: 13px; font-weight: 600; cursor: pointer; color: #475569;
        }
        .btn-outline:hover { background: #f1f5f9; }
        .btn-green {
          padding: 8px 16px; border: none; border-radius: 8px;
          background: #16a34a; color: #fff;
          font-size: 13px; font-weight: 700; cursor: pointer;
        }
        .btn-green:hover { background: #15803d; }

        .report-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .report-table thead th {
          background: #1e3a5f; color: #f8fafc;
          padding: 10px 14px; text-align: left; font-weight: 600;
        }
        .report-table thead th:first-child { border-radius: 8px 0 0 0; }
        .report-table thead th:last-child  { border-radius: 0 8px 0 0; }
        .report-table tbody td { padding: 10px 14px; border-bottom: 1px solid #e8edf2; }
        .report-table tbody tr:hover td { background: #f0f6ff; }

        .pct-wrap { display: flex; align-items: center; gap: 8px; }
        .pct-track { flex: 1; height: 8px; background: #e2e8f0; border-radius: 99px; overflow: hidden; }
        .pct-fill  { height: 100%; border-radius: 99px; transition: width 0.5s ease; }
        .pct-num   { font-weight: 700; font-size: 12px; min-width: 38px; text-align: right; }

        .loading-msg { color: #64748b; font-size: 14px; padding: 20px 0; }
      `}</style>

      {/* Header */}
      <div className="att-header">
        <h1>Student Attendance</h1>
        {activeTable ? (
          <div className="active-table-meta">
            <span><strong>School:</strong> {activeTable.school}</span>
            <span><strong>Program:</strong> {activeTable.program}</span>
            <span><strong>Course:</strong> {activeTable.course}</span>
            <button className="back-to-tables-btn" onClick={() => setActiveTable(null)}>← All Tables</button>
          </div>
        ) : (
          <p>Create or open a course attendance table</p>
        )}
      </div>

      {!activeTable ? (
        <div className="tables-landing">
          {/* Create new table */}
          <form className="create-table-form" onSubmit={createTable}>
            <h3>+ Create New Attendance Table</h3>
            <div className="create-table-row">
              <select value={newProgram} onChange={(e) => setNewProgram(e.target.value)}>
                {ALL_PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input
                type="text" placeholder="Course name (e.g. Data Structures)"
                value={newCourse} onChange={(e) => setNewCourse(e.target.value)} required
              />
              <button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create Table"}
              </button>
            </div>
            <p className="school-preview">School (auto): <strong>{getSchoolForProgram(newProgram)}</strong></p>
          </form>

          {/* Existing tables */}
          {tablesLoaded && tables.length === 0 ? (
            <p className="no-table-msg">No Table Available — create one above to get started.</p>
          ) : (
            <div className="tables-grid">
              {tables.map((t) => (
                <div key={t.id} className="table-card" onClick={() => setActiveTable(t)}>
                  <div className="table-card-course">{t.course}</div>
                  <div className="table-card-meta">{t.program}</div>
                  <div className="table-card-school">{t.school}</div>
                  <button
                    className="table-card-delete"
                    onClick={(e) => { e.stopPropagation(); deleteTable(t.id); }}
                  >🗑</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Controls */}
      <div className="att-controls-bar">
        <div className="ctrl-group">
          <label>Year</label>
          <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="ctrl-group">
          <label>Semester</label>
          <select value={selectedSemIdx} onChange={(e) => setSelectedSemIdx(Number(e.target.value))}>
            <option value={0}>Jan – Jun</option>
            <option value={1}>Jul – Dec</option>
          </select>
        </div>

        <div className="att-actions">
          {saveMsg && (
            <span className={`save-msg${saveMsg.startsWith("✗") ? " err" : ""}`}>{saveMsg}</span>
          )}
          <button className="btn btn-save" onClick={saveAttendance} disabled={saving || !dirty}>
            {saving ? "Saving…" : dirty ? "💾 Save Attendance" : "✓ Saved"}
          </button>
          <button className="btn btn-report" onClick={openReport}>
            📊 View Report
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="legend">
        <span className="legend-chip">
          <span className="legend-swatch" style={{ background: "#dcfce7" }} />
          Present (✅)
        </span>
        <span className="legend-chip">
          <span className="legend-swatch" style={{ background: "#fee2e2" }} />
          Absent (❌)
        </span>
        <span className="legend-chip">
          <span className="legend-swatch" style={{ background: "#f1f5f9", border: "1px dashed #cbd5e1" }} />
          Not marked — click to cycle
        </span>
      </div>

      {/* Table */}
      <div className="att-scroll-wrap">
        <table className="att-table">
          <thead>
            {/* Month row */}
            <tr className="month-row">
              <th className="col-name">Student</th>
              {monthKeys.map((month) => (
                <th key={month} colSpan={monthGroups[month].length}>{month}</th>
              ))}
            </tr>
            {/* Day row */}
            <tr className="day-row">
              <th className="col-name" />
              {weekdays.map((date, i) => (
                <th key={date} className={isMonthEnd(i) ? "month-end" : ""}>
                  {shortLabel(date)}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>

          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td className="col-name">{student.student_name}</td>
                {weekdays.map((date, i) => {
                  const status = cellStatus(student.id, date);
                  return (
                    <td
                      key={date}
                      className={[
                        "att-cell",
                        status === "present" ? "present" : status === "absent" ? "absent" : "empty",
                        isMonthEnd(i) ? "month-end" : "",
                      ].join(" ")}
                      onClick={() => toggle(student.id, date)}
                      title={`${student.student_name} — ${date}`}
                    >
                      {status === "present" ? "✅" : status === "absent" ? "❌" : "·"}
                    </td>
                  );
                })}
                <td>
                  <button className="delete-btn" onClick={() => removeFromCourse(student.id, student.student_name)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}

      {/* Report Modal */}
      {showReport && (
        <div className="modal-overlay" onClick={() => setShowReport(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Attendance Report</h2>
            <p className="modal-sub">{semester.label}</p>

            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setShowReport(false)}>✕ Close</button>
              {reportRows.length > 0 && (
                <button className="btn-green" onClick={savePDF}>⬇ Save / Share PDF</button>
              )}
            </div>

            {reportLoading ? (
              <p className="loading-msg">Loading report…</p>
            ) : (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Course</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Attendance %</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((r) => {
                    const pct   = parseFloat(r.percentage ?? 0);
                    const color = pct >= 80 ? "#16a34a" : pct >= 60 ? "#d97706" : "#dc2626";
                    return (
                      <tr key={r.student_id}>
                        <td style={{ fontWeight: 600, color: "#1e3a5f" }}>{r.student_name}</td>
                        <td>{r.course}</td>
                        <td style={{ color: "#16a34a", fontWeight: 600 }}>{r.present_days}</td>
                        <td style={{ color: "#dc2626", fontWeight: 600 }}>{r.absent_days}</td>
                        <td>
                          <div className="pct-wrap">
                            <div className="pct-track">
                              <div className="pct-fill" style={{ width: `${pct}%`, background: color }} />
                            </div>
                            <span className="pct-num" style={{ color }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Students;
