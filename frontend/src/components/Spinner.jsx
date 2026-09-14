export default function Spinner({ size = 24, label }) {
  return (
    <span className="spinner-wrap" role="status" aria-label={label || 'Loading'}>
      <span className="spinner" style={{ width: size, height: size }}>
        <span className="sr-only">{label || 'Loading'}</span>
      </span>
    </span>
  );
}