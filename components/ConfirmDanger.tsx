import Link from "next/link";
import { btn, ghost, heading, page } from "@/lib/ui";

export function ConfirmDanger({
  title,
  body,
  action,
  cancelHref,
  fields,
  confirmLabel,
}: {
  title: string;
  body: string;
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
  fields: Record<string, string>;
  confirmLabel: string;
}) {
  return (
    <div className={page}>
      <h1 className={heading}>{title}</h1>
      <p className="mb-8 text-pretty text-mute">{body}</p>
      <form action={action} className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button className={btn} type="submit">
          {confirmLabel}
        </button>
        <Link href={cancelHref} className={ghost}>
          cancel
        </Link>
      </form>
    </div>
  );
}
