import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Home from "./pages/Home";
import Students from "./pages/Students";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";

import "./App.css";

function isAuthenticated() {
  return !!localStorage.getItem("token");
}

function ProtectedRoute({ element }) {
  return isAuthenticated() ? element : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/" element={<ProtectedRoute element={<Home />} />} />
        <Route path="/students" element={<ProtectedRoute element={<Students />} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
