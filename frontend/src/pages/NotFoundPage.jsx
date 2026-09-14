import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="state-box">
      <div className="state-badge" aria-hidden="true">
        404
      </div>
      <h1 className="state-title">Page not found</h1>
      <p className="state-message">The page you are looking for does not exist or has moved.</p>
      <div className="state-actions">
        <Link to="/" className="btn btn-primary">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}