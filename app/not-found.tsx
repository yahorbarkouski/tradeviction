import Link from "next/link";
import { heading } from "@/lib/ui";

export default function NotFound() {
  return (
    <>
      <h1 className={heading}>not found</h1>
      <p className="text-mute">
        <Link href="/">back to the feed</Link>
      </p>
    </>
  );
}
