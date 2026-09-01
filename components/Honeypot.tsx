export function Honeypot() {
  return (
    <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
      <label>
        website
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}
