import { Link } from 'react-router-dom';

export default function UnauthorizedPage() {
  return (
    <div className="state-box error">
      <div className="state-badge" aria-hidden="true">
        403
      </div>
      <h1 className="state-title">Access denied</h1>
      <p className="state-message">
        You do not have permission to view this page. Contact an administrator if you believe this
        is a mistake.
      </p>
      <div className="state-actions">
        <Link to="/" className="btn btn-primary">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}