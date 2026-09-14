export default function StatCard({ label, value, sub, tone = 'default', icon: Icon }) {
  return (
    <div className={`stat-card ${tone !== 'default' ? `tone-${tone}` : ''}`}>
      <div className="stat-card-topline">
        <p className="stat-label">{label}</p>
        {Icon ? <span className="stat-icon" aria-hidden="true"><Icon size={18} /></span> : null}
      </div>
      <p className="stat-value">{value}</p>
      {sub ? <p className="stat-sub">{sub}</p> : null}
    </div>
  );
}