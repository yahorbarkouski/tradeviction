import { lookupStartups } from "@/lib/db/queries";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ hits: await lookupStartups(q) });
}
