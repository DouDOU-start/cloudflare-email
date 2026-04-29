import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, type MessageDetail } from "@/lib/api";
import { AttachmentList, BackLink, Button, ConfirmPanel, LinkButton, MailBody, Panel } from "@/components/ui";
import { formatBytes, formatDate } from "@/lib/format";
import { useState } from "react";

export default function MessageDetailPage() {
  const { id } = useParams();
  const msgID = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = useQuery<MessageDetail>({
    queryKey: ["message", msgID],
    queryFn: async () => {
      const data = await api.get<MessageDetail>(`/api/admin/messages/${msgID}`);
      if (!data.is_read) {
        await api.post(`/api/admin/messages/${msgID}/read`);
        qc.invalidateQueries({ queryKey: ["messages"] });
        qc.invalidateQueries({ queryKey: ["mailbox-messages", data.mailbox_id] });
        qc.invalidateQueries({ queryKey: ["mailboxes"] });
      }
      return data;
    },
  });

  const del = useMutation({
    mutationFn: () => api.del(`/api/admin/messages/${msgID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["mailboxes"] });
      if (q.data) qc.invalidateQueries({ queryKey: ["mailbox-messages", q.data.mailbox_id] });
      navigate(-1);
    },
  });

  if (q.isLoading) return <Panel className="p-8 font-mono-display text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">正在加载邮件...</Panel>;
  if (!q.data) return null;
  const m = q.data;
  const bodyClassName =
    m.attachments.length > 0
      ? "min-h-[200px] md:h-[clamp(220px,calc(100dvh-41rem),520px)]"
      : "min-h-[260px] md:h-[clamp(260px,calc(100dvh-31rem),520px)]";

  return (
    <div>
      <div className="mb-5">
        <BackLink to="/admin">返回邮件列表</BackLink>
      </div>
      <Panel className="mb-5 p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="font-mono-display text-[11px] font-bold uppercase tracking-[0.16em] text-accent">邮件详情</div>
            <h1 className="mt-2 break-words font-display text-3xl font-black leading-[0.95] tracking-[-0.05em] text-foreground md:text-5xl">
              {m.subject || "(无主题)"}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="break-all font-semibold text-foreground">{m.from_addr}</span>
              <span className="font-mono-display text-[11px] uppercase tracking-[0.14em]">to</span>
              <span className="break-all font-semibold text-foreground">{m.to_addr}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <LinkButton variant="secondary" size="sm" href={`/api/admin/messages/${m.id}/eml`}>
              下载 EML
            </LinkButton>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              删除
            </Button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t-2 border-border pt-4 text-sm">
          <Meta label="接收时间" value={formatDate(m.received_at)} />
          <Meta label="大小" value={formatBytes(m.size)} />
        </div>
      </Panel>

      <AttachmentList attachments={m.attachments} hrefFor={(id) => `/api/admin/attachments/${id}`} />
      <MailBody html={m.html_body} text={m.text_body} bodyClassName={bodyClassName} />

      {confirmDelete && (
        <ConfirmPanel title="确认删除邮件？" confirmLabel="删除邮件" danger busy={del.isPending} onCancel={() => setConfirmDelete(false)} onConfirm={() => del.mutate()}>
          将永久删除选中的邮件及其已保存附件。
        </ConfirmPanel>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono-display text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-mono-display text-sm font-bold">{value}</div>
    </div>
  );
}
