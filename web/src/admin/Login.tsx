import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Alert, Button, Field, Input, Panel } from "@/components/ui";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      await api.post("/api/admin/login", { username, password });
      navigate("/admin");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="grid w-full max-w-5xl items-stretch gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <Panel className="relative min-h-[520px] overflow-hidden bg-primary p-8 text-primary-foreground md:p-10" accent>
          <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full border-[18px] border-accent/70" />
          <div className="absolute bottom-10 right-8 h-28 w-28 rotate-[-12deg] border-[12px] border-primary-foreground/20" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="postal-border mb-8 h-16 w-16 shadow-hard">
                <div className="flex h-full w-full items-center justify-center border-2 border-border bg-card text-accent">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="1" />
                    <path d="M3 7l9 6 9-6" />
                  </svg>
                </div>
              </div>
              <div className="font-mono-display text-xs font-bold uppercase tracking-[0.18em] text-accent">authorized desk</div>
              <h1 className="mt-4 font-display text-[62px] font-black leading-[0.86] tracking-[-0.075em] md:text-[84px]">
                mail
                <br />
                sorting
                <br />
                room
              </h1>
            </div>
            <p className="max-w-sm text-[15px] leading-7 text-primary-foreground/74">
              管理 Cloudflare Email Routing 投递、只读共享链接和邮件审阅流程。
            </p>
          </div>
        </Panel>

        <Panel className="flex flex-col justify-center p-6 md:p-8">
          <div className="mb-8">
            <div className="font-mono-display text-xs font-bold uppercase tracking-[0.18em] text-accent">cf-email console</div>
            <h2 className="mt-3 font-display text-5xl font-black tracking-[-0.065em]">登录</h2>
            <p className="mt-3 text-[14px] leading-6 text-muted-foreground">输入管理员凭据进入控制台。</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <Field label="用户名">
              <Input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </Field>
            <Field label="密码">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {err && <Alert tone="danger">{err}</Alert>}
            <Button type="submit" variant="stamp" size="lg" className="w-full" disabled={loading}>
              {loading ? "登录中…" : "进入分拣台"}
            </Button>
          </form>
          <div className="mt-6 border-t-2 border-hairline pt-4 font-mono-display text-[11px] uppercase tracking-[0.12em] text-subtle">
            仅限授权管理员访问
          </div>
        </Panel>
      </div>
    </div>
  );
}
