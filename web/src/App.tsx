import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const Login = lazy(() => import("./admin/Login"));
const AdminLayout = lazy(() => import("./admin/AdminLayout"));
const Mailboxes = lazy(() => import("./admin/Mailboxes"));
const MailboxDetail = lazy(() => import("./admin/MailboxDetail"));
const MessageDetail = lazy(() => import("./admin/MessageDetail"));
const Tokens = lazy(() => import("./admin/Tokens"));
const SystemConfig = lazy(() => import("./admin/SystemConfig"));
const Viewer = lazy(() => import("./viewer/Viewer"));
const ViewerMessage = lazy(() => import("./viewer/ViewerMessage"));

export default function App() {
  return (
    <Suspense>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Mailboxes />} />
          <Route path="mailboxes/:id" element={<MailboxDetail />} />
          <Route path="messages/:id" element={<MessageDetail />} />
          <Route path="tokens" element={<Tokens />} />
          <Route path="system-config" element={<SystemConfig />} />
        </Route>
        <Route path="/v/:token" element={<Viewer />} />
        <Route path="/v/:token/messages/:id" element={<ViewerMessage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Suspense>
  );
}
