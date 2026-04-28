interface Env {
  INGEST_TOKEN: string;
  INGEST_SECRET: string;
  INGEST_URL: string;
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

async function hmacSha256Hex(secret: string, data: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const raw = await readAll(message.raw);
    const ts = Date.now().toString();

    // Signature covers: timestamp + "." + raw bytes
    const payload = new Uint8Array(ts.length + 1 + raw.length);
    payload.set(new TextEncoder().encode(ts + "."), 0);
    payload.set(raw, ts.length + 1);
    const sig = await hmacSha256Hex(env.INGEST_SECRET, payload);

    const res = await fetch(env.INGEST_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.INGEST_TOKEN}`,
        "Content-Type": "message/rfc822",
        "X-Timestamp": ts,
        "X-Signature": sig,
        "X-Envelope-From": message.from,
        "X-Envelope-To": message.to,
      },
      body: raw,
    });

    if (res.status >= 500) {
      // Make CF retry later
      throw new Error(`ingest upstream ${res.status}`);
    }
    // 2xx or 4xx: treat as handled (dropped or stored); do not retry
  },
} satisfies ExportedHandler<Env>;
