// What the signed-in viewer has done to comments, as ids, plus their standing.
// Rows overlay it on the public, shared lists so those stay cacheable for
// everyone. Safe to import from Client Components.
export type ViewerMarks = {
  id: string;
  username: string;
  admin: boolean;
  showDead: boolean;
  karma: number;
  voted: string[];
  flagged: string[];
  vouched: string[];
};

export function ownsComment(marks: ViewerMarks | null, userId: string): boolean {
  return marks !== null && marks.id === userId;
}

// A dead comment stays visible to its author and to viewers who opted in.
export function showsDead(marks: ViewerMarks | null, authorId: string): boolean {
  return marks !== null && (marks.showDead || marks.id === authorId);
}
