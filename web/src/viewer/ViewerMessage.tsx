import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, APIError } from "@/lib/api";
import { AttachmentList, BackLink, EmptyState, MailBody, Panel } from "@/components/ui";
import { formatBytes, formatDate } from "@/lib/format";
import { ViewerShell } from "./Viewer";

interface ViewerDetail {
  id: number;
  from_addr: string;
  to_addr: string;
  subject: string;
  received_at: number;
  size: number;
  text_body: string;
  html_body: string;
  attachments: { id: number; filename: string; content_type: string; size: number }[];
}

export default function ViewerMessage() {
  const { token, id } = useParams();

  const q = useQuery<ViewerDetail>({
    queryKey: ["v-message", token, id],
    queryFn: () => api.get<ViewerDetail>(`/api/v/${token}/messages/${id}`),
    retry: false,
  });

  if (q.isLoading) {
    return (
      <ViewerShell>
        <Panel className="p-8 font-mono-display text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">正在加载邮件...</Panel>
      </ViewerShell>
    );
  }
  if (q.error) {
    const status = q.error instanceof APIError ? q.error.status : 0;
    return (
      <ViewerShell>
        <EmptyState title={status === 404 ? "未找到邮件" : "加载失败"} />
      </ViewerShell>
    );
  }
  const m = q.data!;
  const bodyClassName =
    m.attachments.length > 0
      ? "min-h-[200px] md:h-[clamp(220px,calc(100dvh-41rem),520px)]"
      : "min-h-[260px] md:h-[clamp(260px,calc(100dvh-31rem),520px)]";

  return (
    <ViewerShell>
      <div className="mb-5">
        <BackLink to={`/v/${token}`}>返回收件箱</BackLink>
      </div>
      <Panel className="mb-5 p-5 md:p-6">
        <div className="min-w-0">
          <div className="font-mono-display text-[11px] font-bold uppercase tracking-[0.16em] text-accent">共享邮件</div>
          <h1 className="mt-2 break-words font-display text-3xl font-black leading-[0.95] tracking-[-0.05em] text-foreground md:text-5xl">
            {m.subject || "(无主题)"}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="break-all font-semibold text-foreground">{m.from_addr}</span>
            <span className="font-mono-display text-[11px] uppercase tracking-[0.14em]">to</span>
            <span className="break-all font-semibold text-foreground">{m.to_addr}</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t-2 border-border pt-4 text-sm">
          <Meta label="接收时间" value={formatDate(m.received_at)} />
          <Meta label="大小" value={formatBytes(m.size)} />
        </div>
      </Panel>

      <AttachmentList attachments={m.attachments} hrefFor={(attachmentID) => `/api/v/${token}/attachments/${attachmentID}`} />
      <MailBody html={m.html_body} text={m.text_body} bodyClassName={bodyClassName} />
    </ViewerShell>
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
