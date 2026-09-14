import { Link } from 'react-router-dom';
import { FiAlertCircle } from 'react-icons/fi';

export default function ErrorState({ title = 'Something went wrong', message, status, onRetry }) {
  const isForbidden = status === 403;
  const isUnauthorized = status === 401;

  return (
    <div className="state-box error">
      <div className="state-badge" aria-hidden="true">
        {isForbidden || isUnauthorized ? (isForbidden ? '403' : '401') : <FiAlertCircle size={25} />}
      </div>
      <h2 className="state-title">
        {isForbidden ? 'Access denied' : isUnauthorized ? 'Session required' : title}
      </h2>
      <p className="state-message">
        {isForbidden
          ? 'You do not have permission to view this page. Contact an administrator if you believe this is a mistake.'
          : message || 'Unable to load this data. Please try again.'}
      </p>
      <div className="state-actions">
        {onRetry && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
        )}
        {isForbidden ? (
          <Link to="/" className="btn btn-outline">
            Go to Dashboard
          </Link>
        ) : null}
        {isUnauthorized ? (
          <Link to="/login" className="btn btn-outline">
            Go to Login
          </Link>
        ) : null}
      </div>
    </div>
  );
}