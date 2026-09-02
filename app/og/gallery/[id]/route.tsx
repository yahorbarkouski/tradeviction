import { isAdmin } from "@/lib/admin";
import { readCurrentUser } from "@/lib/auth";
import { ogImage } from "@/lib/og";
import { findGalleryCase } from "@/lib/og-gallery";

// One fixture card for the hidden /og/gallery page. Never cached, so a design
// change shows on the next reload. Production answers the admin account only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production" && !isAdmin(await readCurrentUser())) {
    return new Response("Not found", { status: 404 });
  }
  const { id } = await params;
  const found = findGalleryCase(id);
  if (!found) return new Response("Not found", { status: 404 });
  const image = await ogImage(await found.render());
  const headers = new Headers(image.headers);
  headers.set("cache-control", "no-store");
  return new Response(image.body, { status: image.status, headers });
}
