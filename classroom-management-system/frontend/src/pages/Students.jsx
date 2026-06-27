import { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";

import { API_BASE_URL } from "../config";
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

function toCSV(rows, semesterLabel) {
  const header = ["Student Name", "Course", "Total Days", "Present", "Absent", "Attendance %"];
  const body   = rows.map((r) => [
    r.student_name, r.course, r.total_days, r.present_days, r.absent_days, r.percentage ?? "0.0",
  ]);
  return [
    [`Attendance Report – ${semesterLabel}`], [],
    header, ...body,
  ].map((row) => row.join(",")).join("\n");
}

/* ─── component ────────────────────────────────────────────────────────── */

function Students() {
  const currentYear  = new Date().getFullYear();
  const yearOptions  = [currentYear - 1, currentYear, currentYear + 1];

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

  useEffect(() => {
    axios.get(`${API}/students`).then((r) => setStudents(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    axios.get(`${API}/attendance`, { params: { start: semester.start, end: semester.end } })
      .then(({ data }) => {
        const map = {};
        for (const row of data) {
          if (!map[row.student_id]) map[row.student_id] = {};
          map[row.student_id][row.date] = row.status;
        }
        setAttendance(map);
        setDirty(false);
      }).catch(console.error);
  }, [semester]);

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
      await axios.post(`${API}/attendance`, { records });
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
        params: { start: semester.start, end: semester.end },
      });
      setReportRows(data);
    } catch (err) { console.error(err); }
    finally { setReportLoading(false); }
  };

  const downloadCSV = () => {
    const blob = new Blob([toCSV(reportRows, semester.label)], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), {
      href: url, download: `attendance_${semester.label.replace(/\s/g, "_")}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const cellStatus = (sid, date) => attendance[sid]?.[date] ?? null;

  const isMonthEnd = (i) =>
    i === weekdays.length - 1 ||
    parseLocalDate(weekdays[i + 1]).getMonth() !== parseLocalDate(weekdays[i]).getMonth();

  return (
    <div className="att-page">
      <Navbar />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap');

        .att-page {
          min-height: 100vh;
          background: #f0f4f8;
          font-family: 'DM Sans', sans-serif;
          padding-bottom: 60px;
        }

        /* ── Page header ── */
        .att-header {
          background: linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%);
          padding: 28px 32px 24px;
          color: #fff;
          margin-bottom: 28px;
        }
        .att-header h1 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 26px;
          margin: 0 0 4px;
          letter-spacing: -0.5px;
        }
        .att-header p { margin: 0; font-size: 13px; opacity: 0.75; }

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
        <p>Track and manage daily attendance for the selected semester</p>
      </div>

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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Report Modal */}
      {showReport && (
        <div className="modal-overlay" onClick={() => setShowReport(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Attendance Report</h2>
            <p className="modal-sub">{semester.label}</p>

            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setShowReport(false)}>✕ Close</button>
              {reportRows.length > 0 && (
                <button className="btn-green" onClick={downloadCSV}>⬇ Download CSV</button>
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
