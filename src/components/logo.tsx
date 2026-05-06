export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-tight ${className}`}>
      <span style={{ color: "var(--brand-orange)" }}>Popp</span>
      <span style={{ color: "var(--brand-green)" }}>Off</span>
    </span>
  );
}
