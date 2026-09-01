import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDeleteUserAction } from "@/app/actions";
import { ConfirmDanger } from "@/components/ConfirmDanger";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { getUserByUsername } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "delete" };

export default async function DeleteUserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const viewer = await getCurrentUser();
  if (!isAdmin(viewer)) notFound();
  const { username } = await params;
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
