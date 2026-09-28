// فراخوانی مشترک هوش مصنوعی لیارا برای جاب‌های دسته‌ای (news-insights،
// extract-post-keywords).
//
// ⚠️ مهر ۱۴۰۵: درخواست‌هایی که جوابشون طول می‌کشید (دسته‌ی چندپستی) بعد از
// ~۱۸ ثانیه با ۵۰۰ از لیارا برمی‌گشتن، در حالی که ترجمه‌ی تک‌پستی (جواب
// کوتاه) سالم بود. برای همین جواب با stream گرفته می‌شه — توکن‌ها از همون
// ثانیه‌های اول می‌رسن و اتصال بی‌کار نمی‌مونه. اگه سرور stream رو نادیده
// گرفت و JSON معمولی داد، همون خونده می‌شه.

export const LIARA_BASE_URL = "https://ai.liara.ir/api/6a9271a1d6564b043acdefe1/v1";
export const LIARA_MODEL = "openai/gpt-4o-mini";

// خطای «وقت تموم شد» — مقصر پست نیست، پس کالر نباید پست رو «بررسی‌شده» علامت بزنه
export class AiTimeoutError extends Error {}

// متن جواب مدل رو برمی‌گردونه؛ هر خطا (HTTP، خطای وسط stream، جواب خالی) throw می‌شه.
// timeoutMs: سقف کل درخواست (اتصال + خوندن stream) — بعدش AiTimeoutError
export async function liaraChat(system: string, user: string, temperature: number, timeoutMs: number): Promise<string> {
  if (timeoutMs <= 0) throw new AiTimeoutError("no time left");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await liaraChatInner(system, user, temperature, ctrl.signal);
  } catch (e) {
    if (ctrl.signal.aborted) throw new AiTimeoutError(`ai timeout after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function liaraChatInner(system: string, user: string, temperature: number, signal: AbortSignal): Promise<string> {
  const res = await fetch(`${LIARA_BASE_URL}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("LIARA_API_KEY")}` },
    body: JSON.stringify({
      model: LIARA_MODEL,
      temperature,
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ai ${res.status}: ${(await res.text()).slice(0, 300)}`);

  let out = "";
  if (!(res.headers.get("content-type") || "").includes("text/event-stream") || !res.body) {
    const data = await res.json();
    out = data?.choices?.[0]?.message?.content || "";
  } else {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const handleLine = (raw: string) => {
      const line = raw.trim();
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") return;
      let j: { error?: unknown; choices?: Array<{ delta?: { content?: string } }> };
      try {
        j = JSON.parse(data);
      } catch {
        return;
      }
      if (j.error) throw new Error(`ai stream error: ${JSON.stringify(j.error).slice(0, 300)}`);
      out += j.choices?.[0]?.delta?.content || "";
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        handleLine(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    }
    handleLine(buf);
  }
  out = out.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
  if (!out) throw new Error("ai returned empty content");
  return out;
}

// مثل Promise.all ولی حداکثر `limit` کار هم‌زمان — تا لیارا با انبوه
// درخواست موازی بار اضافه نگیره
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
