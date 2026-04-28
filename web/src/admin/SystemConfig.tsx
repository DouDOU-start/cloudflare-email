import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, Button, Field, Input, PageHeader, Panel } from "@/components/ui";
import { APIError, api, type SystemConfig as SystemConfigData } from "@/lib/api";

type UpdateSystemConfig = {
  ingest_token?: string;
  admin_username?: string;
  admin_password?: string;
};

export default function SystemConfig() {
  const qc = useQueryClient();
  const config = useQuery<SystemConfigData>({
    queryKey: ["system-config"],
    queryFn: () => api.get<SystemConfigData>("/api/admin/system-config"),
  });

  const [ingestToken, setIngestToken] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showIngestToken, setShowIngestToken] = useState(false);
  const [copiedIngestToken, setCopiedIngestToken] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!config.data) return;
    setIngestToken(config.data.ingest_token);
    setAdminUsername(config.data.admin_username);
    setAdminPassword("");
  }, [config.data]);

  const update = useMutation({
    mutationFn: (body: UpdateSystemConfig) => api.patch<SystemConfigData>("/api/admin/system-config", body),
    onSuccess: (data) => {
      qc.setQueryData(["system-config"], data);
      qc.invalidateQueries({ queryKey: ["me"] });
      setAdminPassword("");
      setSaved(true);
    },
  });

  const current = config.data;
  const isBusy = config.isLoading || update.isPending;
  const canSave = !!current && !isBusy && (current.editable.ingest_token || current.editable.admin_username || current.editable.admin_password);

  function save() {
    if (!current) return;
    setSaved(false);

    const body: UpdateSystemConfig = {};
    if (current.editable.ingest_token && ingestToken !== current.ingest_token) body.ingest_token = ingestToken;
    if (current.editable.admin_username && adminUsername !== current.admin_username) body.admin_username = adminUsername;
    if (current.editable.admin_password && adminPassword) body.admin_password = adminPassword;

    update.mutate(body);
  }

  async function copyIngestToken() {
    if (!ingestToken) return;
    await navigator.clipboard.writeText(ingestToken);
    setCopiedIngestToken(true);
  }

  return (
    <div className="h-full overflow-auto pb-8">
      <PageHeader
        eyebrow="System"
        title="系统配置"
        subtitle="管理 Worker 投递令牌和管理员登录凭据。保存后会写入 config.yaml，并立即影响新的请求。"
      />

      <div className="max-w-5xl">
        <Panel className="p-5" accent>
          <div className="space-y-5">
            {config.isLoading ? <Alert>正在加载系统配置...</Alert> : null}
            {config.error ? <Alert tone="danger">{errorMessage(config.error)}</Alert> : null}
            {update.error ? <Alert tone="danger">{errorMessage(update.error)}</Alert> : null}
            {saved && !update.error ? <Alert tone="success">系统配置已保存。</Alert> : null}

            <Field label="INGEST_TOKEN" hint={current?.editable.ingest_token ? "Cloudflare Worker 调用 /ingest/email 时使用的 Bearer Token。" : "当前由环境变量 INGEST_TOKEN 接管，不能在网页修改。"}>
              <div className="flex flex-col gap-2 lg:flex-row">
                <Input
                  type={showIngestToken ? "text" : "password"}
                  className="font-mono lg:min-w-0 lg:flex-1"
                  value={ingestToken}
                  onChange={(e) => {
                    setIngestToken(e.target.value);
                    setCopiedIngestToken(false);
                  }}
                  disabled={!current?.editable.ingest_token || isBusy}
                  spellCheck={false}
                  autoComplete="off"
                />
                <div className="grid grid-cols-3 gap-2 lg:flex lg:shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    className="whitespace-nowrap px-3"
                    disabled={!current || isBusy}
                    onClick={() => setShowIngestToken((show) => !show)}
                  >
                    {showIngestToken ? "隐藏" : "显示"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="whitespace-nowrap px-3"
                    disabled={!ingestToken || isBusy}
                    onClick={copyIngestToken}
                  >
                    {copiedIngestToken ? "已复制" : "复制"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="whitespace-nowrap px-3"
                    disabled={!current?.editable.ingest_token || isBusy}
                    onClick={() => {
                      setIngestToken(generateIngestToken());
                      setShowIngestToken(true);
                      setCopiedIngestToken(false);
                      setSaved(false);
                    }}
                  >
                    自动生成
                  </Button>
                </div>
              </div>
            </Field>

            <Field label="管理员用户名" hint={current?.editable.admin_username ? "用于登录后台管理页面。" : "当前由环境变量 ADMIN_USERNAME 接管，不能在网页修改。"}>
              <Input
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                disabled={!current?.editable.admin_username || isBusy}
                autoComplete="username"
              />
            </Field>

            <Field label="管理员密码" hint={current?.editable.admin_password ? "留空则不修改现有密码。" : "当前由环境变量 ADMIN_PASSWORD 接管，不能在网页修改。"}>
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                disabled={!current?.editable.admin_password || isBusy}
                placeholder={current?.admin_password_set ? "留空则不修改" : "请输入新密码"}
                autoComplete="new-password"
              />
            </Field>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={save} disabled={!canSave} variant="stamp">
                {update.isPending ? "保存中..." : "保存配置"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!current || isBusy}
                onClick={() => {
                  if (!current) return;
                  setIngestToken(current.ingest_token);
                  setAdminUsername(current.admin_username);
                  setAdminPassword("");
                  setShowIngestToken(false);
                  setCopiedIngestToken(false);
                  setSaved(false);
                }}
              >
                重置表单
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function generateIngestToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function errorMessage(error: unknown) {
  if (error instanceof APIError) return error.message;
  return String(error);
}
