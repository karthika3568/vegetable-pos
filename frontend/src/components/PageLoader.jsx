import Spinner from './Spinner.jsx';

export default function PageLoader({ full = true, label = 'Loading…' }) {
  return (
    <div className={full ? 'page-loader' : 'page-loader inline'}>
      <Spinner size={32} label={label} />
      <p className="page-loader-label">{label}</p>
    </div>
  );
}