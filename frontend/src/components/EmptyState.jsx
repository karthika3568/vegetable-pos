import { FiInbox } from 'react-icons/fi';

export default function EmptyState({ title = 'No data yet', description, actions }) {
  return (
    <div className="state-box empty">
      <div className="state-badge" aria-hidden="true">
        <FiInbox size={24} />
      </div>
      <h2 className="state-title">{title}</h2>
      {description ? <p className="state-message">{description}</p> : null}
      {actions ? <div className="state-actions">{actions}</div> : null}
    </div>
  );
}