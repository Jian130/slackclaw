export function Progress(props: { value: number; label?: string }) {
  const value = `${Math.min(100, Math.max(0, props.value))}%`;

  return (
    <div className="progress" style={{ ["--progress-value" as string]: value }}>
      {props.label ? <div className="progress__label">{props.label}</div> : null}
      <div className="progress__track">
        <div className="progress__fill" />
      </div>
    </div>
  );
}
