import { FiEdit2, FiEye, FiPower, FiTrash2 } from 'react-icons/fi';

const ACTIONS = {
  view: { Icon: FiEye, label: 'View' },
  edit: { Icon: FiEdit2, label: 'Edit' },
  delete: { Icon: FiTrash2, label: 'Delete' },
  activate: { Icon: FiPower, label: 'Activate' },
  deactivate: { Icon: FiPower, label: 'Deactivate' },
};

export default function ActionButton({ action, children, className = 'btn btn-outline btn-sm', ...props }) {
  const definition = ACTIONS[action] || ACTIONS.view;
  const Icon = definition.Icon;
  const label = children || definition.label;

  return (
    <button
      type="button"
      className={`${className} action-button`}
      aria-label={typeof label === 'string' ? label : definition.label}
      title={typeof label === 'string' ? label : definition.label}
      {...props}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
