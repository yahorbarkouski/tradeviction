import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminDeleteUserAction } from "@/app/actions";
import { ConfirmDanger } from "@/components/ConfirmDanger";
import { LineSkeleton } from "@/components/Skeleton";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { getUserByUsername } from "@/lib/db/queries";

export const metadata: Metadata = { title: "delete" };

export default function DeleteUserPage({ params }: PageProps<"/u/[username]/delete">) {
  return (
    <Suspense fallback={<LineSkeleton />}>
      <DeleteBody params={params} />
    </Suspense>
  );
}

async function DeleteBody({ params }: Pick<PageProps<"/u/[username]/delete">, "params">) {
  const [viewer, { username }] = await Promise.all([getCurrentUser(), params]);
  if (!isAdmin(viewer)) notFound();
  const user = await getUserByUsername(username);
  if (!user || isAdmin(user)) notFound();
  return (
    <ConfirmDanger
      title={`Delete ${user.username}?`}
      body="This removes the account, their comments, and their book. Replies by other people stay, attached to the next living parent. It cannot be undone."
      action={adminDeleteUserAction}
      cancelHref={`/u/${user.username}`}
      fields={{ username: user.username }}
      confirmLabel="delete user"
    />
  );
}
