import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import AuthCallback from "@/pages/AuthCallback";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/lib/auth";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import InterviewSetup from "@/pages/InterviewSetup";
import Lobby from "@/pages/Lobby";
import Room from "@/pages/Room";
import Waiting from "@/pages/Waiting";
import Report from "@/pages/Report";
import History from "@/pages/History";
import { CommunicationSkills, TechnicalSkills } from "@/pages/Skills";
import Practice from "@/pages/Practice";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import DrillPage from "@/pages/Drill";
import Pricing, { PaymentCancel, PaymentSuccess } from "@/pages/Pricing";

const guard = (el: React.ReactNode, admin = false) => <RequireAuth admin={admin}>{el}</RequireAuth>;

export default function App() {
  const location = useLocation();
  // Google sign-in return: process the one-time session_id before any route renders.
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/" element={guard(<Dashboard />)} />
        <Route path="/interview/new" element={guard(<InterviewSetup />)} />
        <Route path="/interview/:id/lobby" element={guard(<Lobby />)} />
        <Route path="/interview/:id/room" element={guard(<Room />)} />
        <Route path="/interview/:id/waiting" element={guard(<Waiting />)} />
        <Route path="/interview/:id/report" element={guard(<Report />)} />
        <Route path="/history" element={guard(<History />)} />
        <Route path="/skills/communication" element={guard(<CommunicationSkills />)} />
        <Route path="/skills/technical" element={guard(<TechnicalSkills />)} />
        <Route path="/practice" element={guard(<Practice />)} />
        <Route path="/practice/drill/:id" element={guard(<DrillPage />)} />
        <Route path="/pricing" element={<Navigate to="/dashboard" replace />} />
        <Route path="/payment/success" element={guard(<PaymentSuccess />)} />
        <Route path="/payment/cancel" element={guard(<PaymentCancel />)} />
        <Route path="/profile" element={guard(<Profile />)} />
        <Route path="/admin" element={guard(<Admin />, true)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors />
    </>
  );
}
