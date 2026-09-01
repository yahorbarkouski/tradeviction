export const ADMIN_USERNAME = "admin";

export function isAdmin(user: { username: string } | null | undefined): boolean {
  return Boolean(user && user.username.toLowerCase() === ADMIN_USERNAME);
}

export function seesDead(user: { username: string; showDead: boolean } | null | undefined): boolean {
  return Boolean(user && (user.showDead || isAdmin(user)));
}
