export function StatusPill({ value }: { value: string }) {
  return (
    <span className={`status-pill status-${value.replaceAll("_", "-")}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
