// تابع‌های سرور (همان کد supabase/functions، بدون تغییر) روی سرور خودمان.
// هر تابع در Supabase با Deno.serve(handler) اجرا می‌شد؛ اینجا Deno.serve را موقتاً جانشین
// می‌کنیم تا handler هر تابع را بگیریم، و همه را با یک سرور روی /functions/v1/<نام> می‌دهیم.
// run-job و notify اینجا نیستند (سرویس jaryan-jobs، چون روی این سرور گیت‌هاب و Resend نداریم).
const FUNCTIONS = ["translate", "news-insights", "extract-post-keywords"];
type Handler = (req: Request) => Response | Promise<Response>;

const realServe = Deno.serve.bind(Deno);
const handlers: Record<string, Handler> = {};
let current = "";
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (a: any, b?: any) => {
  handlers[current] = typeof a === "function" ? a : (b ?? a.handler);
  return { finished: new Promise(() => {}), shutdown: async () => {}, ref() {}, unref() {}, addr: {} };
};
for (const name of FUNCTIONS) {
  current = name;
  await import(`./${name}/index.ts`);
  if (!handlers[name]) throw new Error("تابع " + name + " Deno.serve را صدا نزد");
}

const port = Number(Deno.env.get("JARYAN_FUNCTIONS_PORT") || "8093");
realServe({ hostname: "127.0.0.1", port, onListen: () => console.log("functions on", port) }, (req) => {
  const m = new URL(req.url).pathname.match(/^\/functions\/v1\/([a-z-]+)\/?$/);
  const h = m && Object.hasOwn(handlers, m[1]) ? handlers[m[1]] : null;
  if (!h) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  return h(req);
});
