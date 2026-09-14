import EmptyState from './EmptyState.jsx';

/**
 * Rendered for every module that is part of the foundation routes but is
 * implemented in a later frontend phase. Prevents blank screens and keeps
 * navigation/routing testable before the business pages exist.
 */
export default function ModulePlaceholder({ title, description }) {
  return (
    <div className="module-placeholder">
      <h1 className="page-title">{title}</h1>
      <EmptyState
        title={`${title} is on the way`}
        description={
          description ||
          'This module is part of the planned application and will be implemented in the next frontend phase. The navigation, permissions, and route are already wired.'
        }
      />
    </div>
  );
}