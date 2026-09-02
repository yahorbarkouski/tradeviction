import { cacheLife } from "next/cache";

// The time a shared page shell was built. Server Components that otherwise
// read only cached data take their clock from here, so the prerender stays
// cacheable; client rows move it forward after hydration (see useNow).
export async function cachedNow(): Promise<number> {
  "use cache";
  cacheLife("minutes");
  return Date.now();
}
