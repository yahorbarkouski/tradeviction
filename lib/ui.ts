export const fieldHead = "mb-1.5 block text-mute";

export const field = `mt-3.5 ${fieldHead}`;

export const input =
  "block w-full max-w-md border border-line bg-transparent px-2.5 py-2 font-sans text-base text-ink placeholder:text-mute/60";

export const qty =
  "block w-24 border border-line bg-transparent px-2.5 py-2 font-sans text-base text-ink tabular-nums";

export const area = `${input} min-h-24 resize-y`;

const tap =
  "transition-[color,opacity,transform,background-color,border-color] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96]";

export const btn =
  `flex w-fit min-h-10 items-center bg-transparent px-0 py-2 font-sans text-base text-ink underline decoration-1 underline-offset-[0.12em] ${tap} hover:opacity-70 hover:no-underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline`;

export const ghost =
  `inline-flex min-h-10 items-center bg-transparent px-0 py-2 font-sans text-base text-mute ${tap} hover:text-ink hover:no-underline`;

export const quiet =
  "inline min-h-10 text-mute hover:underline decoration-1 [text-underline-offset:0.12em] disabled:opacity-40";

export const kicker = "text-mute";

export const label = "text-mute";

export const metric = "font-mono text-lg font-medium leading-none tracking-[-0.02em] tabular-nums";

export const num = "font-mono text-base font-medium tabular-nums";

export const stance =
  `min-h-10 border bg-transparent px-3.5 py-1.5 font-sans ${tap} hover:no-underline`;

export const closeBtn =
  `inline-flex min-h-10 shrink-0 items-center bg-transparent px-0 py-2 font-sans text-base text-mute underline decoration-1 underline-offset-[0.12em] ${tap} hover:text-ink hover:opacity-70 hover:no-underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline`;

export const heading = "m-0 mb-1 font-medium tracking-[-0.01em] text-balance leading-[1.36]";

export const page = "pt-6";

export const mono = "font-mono tabular-nums";

export const statLine = "inline-flex flex-wrap items-center gap-x-[0.4em] leading-none";
