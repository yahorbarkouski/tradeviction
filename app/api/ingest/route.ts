import { seedCatalog } from "@/lib/catalog";

// Cron entry point: re-inserts any catalog company that went missing, whatever
// the stored catalog version says.
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
  await seedCatalog();
  return Response.json({ ok: true });
}
