import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { Logo, Skeleton, Toaster } from "./components/ui";
import Chat from "./pages/Chat";

const Setup = lazy(() => import("./pages/setup/Setup"));
const Present = lazy(() => import("./pages/Present"));
const AdminApp = lazy(() => import("./pages/admin/AdminApp"));
const Poster = lazy(() => import("./pages/print/Poster"));
const PrivacyReport = lazy(() => import("./pages/print/PrivacyReport"));
const SummaryPrint = lazy(() => import("./pages/print/SummaryPrint"));

function Loading() {
  return (
    <div className="mx-auto max-w-md p-8">
      <Logo />
      <div className="mt-8"><Skeleton lines={4} /></div>
    </div>
  );
}

function Home() {
  const [dest, setDest] = useState<string | null>(null);
  useEffect(() => {
    api("/api/public")
      .then((p) => setDest(!p.setup_done && p.is_server ? "/setup" : "/chat"))
      .catch(() => setDest("/chat"));
  }, []);
  return dest ? <Navigate to={dest} replace /> : <Loading />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup/*" element={<Setup />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/present" element={<Present />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/print/poster" element={<Poster />} />
          <Route path="/print/privacy" element={<PrivacyReport />} />
          <Route path="/print/summary" element={<SummaryPrint />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}
