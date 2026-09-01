import { ensureCatalog } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("Unauthorized", { status: 401 });
  }
  await ensureCatalog();
  return Response.json({ ok: true });
}
