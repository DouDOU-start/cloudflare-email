import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./admin/Login";
import AdminLayout from "./admin/AdminLayout";
import Mailboxes from "./admin/Mailboxes";
import MailboxDetail from "./admin/MailboxDetail";
import MessageDetail from "./admin/MessageDetail";
import Tokens from "./admin/Tokens";
import Viewer from "./viewer/Viewer";
import ViewerMessage from "./viewer/ViewerMessage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin/login" element={<Login />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Mailboxes />} />
        <Route path="mailboxes/:id" element={<MailboxDetail />} />
        <Route path="messages/:id" element={<MessageDetail />} />
        <Route path="tokens" element={<Tokens />} />
      </Route>
      <Route path="/v/:token" element={<Viewer />} />
      <Route path="/v/:token/messages/:id" element={<ViewerMessage />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
