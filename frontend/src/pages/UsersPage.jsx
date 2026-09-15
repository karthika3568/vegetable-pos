import { useCallback, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { userService } from '../services/user.service.js';
import { NAVIGATION } from '../config/navigation.js';
import { useLanguage } from '../i18n/index.jsx';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import ActionButton from '../components/ActionButton.jsx';

const LIMIT = 50;

// Group labels keep the existing DB `module` grouping (so a permission is
// never duplicated) while presenting the same logical families the Admin
// sidebar uses. The labels below are display-only - the permission records
// themselves are not renamed or invented.
const SECTION_LABELS = {
  reports: 'Reports & Insights',
  sales: 'Sales & POS',
  purchases: 'Stock & Purchases',
  stock: 'Stock & Purchases',
  products: 'Catalog & Products',
  customers: 'Customers & Suppliers',
  suppliers: 'Customers & Suppliers',
  credit: 'Credit & Payments',
  expenses: 'Expenses & Income',
  settings: 'System & Settings',
  users: 'Users & Access',
};

const SECTION_ORDER = [
  'sales',
  'purchases',
  'stock',
  'products',
  'customers',
  'suppliers',
  'credit',
  'expenses',
  'reports',
  'settings',
  'users',
];

function buildPermissionGroups(permissions) {
  const groups = new Map();
  for (const permission of permissions) {
    const module = permission.module || 'other';
    if (!groups.has(module)) groups.set(module, []);
    groups.get(module).push(permission);
  }
  return Array.from(groups.entries())
    .map(([module, items]) => ({
      module,
      label: SECTION_LABELS[module] || module,
      order: SECTION_ORDER.includes(module) ? SECTION_ORDER.indexOf(module) : SECTION_ORDER.length,
      items,
    }))
    .sort((a, b) => a.order - b.order);
}

// Which sidebar pages are controlled by each permission code, derived from
// the real navigation config so the modal always matches the current Admin
// modules (Dashboard, POS, Invoices, Product Analytics, etc.).
function buildUnlockMap(t) {
  const map = {};
  for (const section of NAVIGATION) {
    for (const item of section.items) {
      if (!item.permission) continue;
      if (!map[item.permission]) map[item.permission] = [];
      map[item.permission].push(t(item.labelKey ?? item.id));
    }
  }
  return map;
}

function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function StatusBadge({ status }) {
  return <span className={`badge badge-${status === 'active' ? 'active' : 'inactive'}`}>{statusLabel(status)}</span>;
}

function PermissionPicker({ permissions, selected, onChange, disabled }) {
  const { t } = useLanguage();
  const groups = buildPermissionGroups(permissions);
  const unlockMap = buildUnlockMap(t);

  function toggle(code) {
    onChange(selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code]);
  }

  function selectAll() {
    onChange(permissions.map((item) => item.code));
  }

  return (
    <fieldset className="permission-fieldset" disabled={disabled}>
      <legend>Employee permissions</legend>
      <div className="permission-toolbar">
        <span>
          {permissions.length} permission{permissions.length === 1 ? '' : 's'} · select the exact access this
          employee needs.
        </span>
        <div className="permission-toolbar-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={selectAll}>
            Select all
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange([])}>
            Clear all
          </button>
        </div>
      </div>
      <div className="permission-groups">
        {groups.map((group) => (
          <section className="permission-group" key={group.module}>
            <h3>{group.label}</h3>
            <div className="permission-options">
              {group.items.map((permission) => {
                const unlocks = unlockMap[permission.code];
                return (
                  <label className="permission-option" key={permission.code}>
                    <input
                      type="checkbox"
                      checked={selected.includes(permission.code)}
                      onChange={() => toggle(permission.code)}
                    />
                    <span>
                      <strong>{permission.code}</strong>
                      {permission.description ? <small>{permission.description}</small> : null}
                      {unlocks && unlocks.length > 0 ? (
                        <small className="permission-modules">{unlocks.join(' · ')}</small>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </fieldset>
  );
}

function UserFormModal({ mode, initial, roles, permissions, onClose, onSubmit }) {
  const editing = mode === 'edit';
  const [username, setUsername] = useState(initial?.username ?? '');
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [password, setPassword] = useState('');
  const defaultRole = roles.find((role) => role.name !== 'admin') ?? roles[0];
  const [roleId, setRoleId] = useState(String(initial?.roleId ?? defaultRole?.id ?? ''));
  const [selectedPermissions, setSelectedPermissions] = useState(initial?.permissions ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const selectedRole = roles.find((role) => String(role.id) === String(roleId));
  const isAdminRole = selectedRole?.name === 'admin';

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!fullName.trim()) return setError('Name is required.');
    if (!roleId) return setError('Role is required.');
    if (!editing && password.length < 8) return setError('Password must be at least 8 characters.');
    const trimmedPhone = phone.trim();
    const digitCount = (trimmedPhone.match(/\d/g) || []).length;
    if (trimmedPhone && (!/^\+?[0-9()\s.-]+$/.test(trimmedPhone) || digitCount < 7)) {
      return setError('Phone must contain at least 7 digits and use a valid phone format.');
    }

    setSubmitting(true);
    try {
      const userPayload = {
        fullName: fullName.trim(),
        phone: trimmedPhone || null,
        address: address.trim() || null,
        roleId: Number(roleId),
      };
      if (!editing) Object.assign(userPayload, { username: username.trim(), password, permissions: selectedPermissions });
      await onSubmit(userPayload, editing && !isAdminRole ? selectedPermissions : null);
    } catch (err) {
      setError(err?.message || 'Unable to save employee.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit Employee Access' : 'Create Employee'} onClose={onClose} wide>
      <form className="form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="userUsername">Username</label>
            <input id="userUsername" value={username} onChange={(event) => setUsername(event.target.value)} disabled={editing || submitting} required />
          </div>
          <div className="form-field">
            <label htmlFor="userFullName">Name</label>
            <input id="userFullName" value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={submitting} required />
          </div>
          <div className="form-field">
            <label htmlFor="userPhone">Phone Number</label>
            <input id="userPhone" type="tel" inputMode="tel" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} disabled={submitting} />
          </div>
          <div className="form-field">
            <label htmlFor="userAddress">Address</label>
            <textarea id="userAddress" rows="3" maxLength={255} value={address} onChange={(event) => setAddress(event.target.value)} disabled={submitting} />
          </div>
          {!editing ? (
            <div className="form-field">
              <label htmlFor="userPassword">Password</label>
              <input id="userPassword" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} required />
            </div>
          ) : null}
          <div className="form-field">
            <label htmlFor="userRole">Role</label>
            <select id="userRole" value={roleId} onChange={(event) => setRoleId(event.target.value)} disabled={submitting}>
              {roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}
            </select>
          </div>
        </div>

        {permissions.length > 0 && !isAdminRole ? (
          <PermissionPicker permissions={permissions} selected={selectedPermissions} onChange={setSelectedPermissions} disabled={submitting} />
        ) : null}
        {isAdminRole ? <p className="notice-bar notice-bar-muted">Admin accounts have unrestricted access and do not use individual permission assignments.</p> : null}
        {error ? <div className="form-alert" role="alert">{error}</div> : null}
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : editing ? 'Save Access' : 'Create Employee'}</button>
        </div>
      </form>
    </Modal>
  );
}

function UserViewModal({ user, onClose }) {
  return (
    <Modal title={`Employee: ${user.fullName || user.username}`} onClose={onClose}>
      <dl className="user-details">
        <div><dt>Username</dt><dd>{user.username}</dd></div>
        <div><dt>Phone</dt><dd>{user.phone || '—'}</dd></div>
        <div><dt>Address</dt><dd>{user.address || '—'}</dd></div>
        <div><dt>Role</dt><dd>{user.roleName}</dd></div>
        <div><dt>Status</dt><dd><StatusBadge status={user.status} /></dd></div>
        <div><dt>Permissions</dt><dd>{user.roleName === 'admin' ? 'All permissions' : user.permissions.join(', ') || 'None assigned'}</dd></div>
      </dl>
    </Modal>
  );
}

export default function UsersPage() {
  const { showToast } = useToast();
  const [formState, setFormState] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [status, setStatus] = useState('');

  const list = useAsync(() => userService.list({ status: status || undefined, limit: LIMIT }), [status]);
  const roles = useAsync(() => userService.roles(), []);
  const permissions = useAsync(() => userService.permissions(), []);
  const closeForm = useCallback(() => setFormState(null), []);

  async function submitCreate(payload) {
    await userService.create(payload);
    setFormState(null);
    showToast('Employee created successfully.', 'success');
    list.refetch();
  }

  async function submitEdit(payload, selectedPermissions) {
    await userService.update(formState.user.id, payload);
    if (selectedPermissions) await userService.setPermissions(formState.user.id, selectedPermissions);
    setFormState(null);
    showToast('Permissions updated successfully.', 'success');
    list.refetch();
  }

  async function toggleStatus(user) {
    const next = user.status === 'active' ? 'inactive' : 'active';
    try {
      await userService.setStatus(user.id, next);
      showToast(`Employee ${next === 'active' ? 'activated' : 'deactivated'} successfully.`, 'success');
      list.refetch();
    } catch (err) {
      showToast(err?.message || 'Unable to update employee status.', 'error');
    }
  }

  async function forceLogout(user) {
    try {
      await userService.forceLogout(user.id);
      showToast('Employee sessions ended successfully.', 'success');
    } catch (err) {
      showToast(err?.message || 'Unable to end employee sessions.', 'error');
    }
  }

  async function openEdit(user) {
    try {
      const detail = await userService.get(user.id);
      setFormState({ mode: 'edit', user: detail });
    } catch (err) {
      showToast(err?.message || 'Unable to load employee permissions.', 'error');
    }
  }

  const items = list.data?.items ?? [];

  return (
    <div className="users-page">
      <div className="page-heading">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-intro">Create employee accounts and grant only the access each person needs.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setFormState({ mode: 'create' })}>Create Employee</button>
      </div>

      <div className="toolbar">
        <div className="toolbar-actions">
          <label className="toolbar-select"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></label>
        </div>
      </div>

      {list.loading && !list.data ? <PageLoader label="Loading users…" /> : null}
      {list.error && !list.data ? <ErrorState title="Users unavailable" message={list.error.message} status={list.error.status} onRetry={list.refetch} /> : null}
      {list.data && items.length === 0 ? <EmptyState title="No users found" description="Create an employee account to grant controlled access." /> : null}
      {list.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools"><p className="table-count">{list.data.pagination?.total ?? items.length} users</p>{list.loading ? <span className="table-refreshing">Refreshing…</span> : null}</div>
          <div className="table-scroll">
            <table className="data-table users-table">
              <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Last login</th><th className="actions-col">Actions</th></tr></thead>
              <tbody>{items.map((user) => <tr key={user.id}>
                <td><span className="cell-main">{user.username}</span></td>
                <td>{user.fullName || '—'}</td>
                <td>{user.roleName}</td>
                <td><StatusBadge status={user.status} /></td>
                <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</td>
                <td className="actions-col"><div className="table-actions">
                  <ActionButton action="view" onClick={async () => { const detail = await userService.get(user.id); setViewing(detail); }} />
                  <ActionButton action="edit" onClick={() => openEdit(user)} />
                  <ActionButton action={user.status === 'active' ? 'deactivate' : 'activate'} onClick={() => toggleStatus(user)}>{user.status === 'active' ? 'Deactivate' : 'Activate'}</ActionButton>
                  <ActionButton action="deactivate" onClick={() => forceLogout(user)}>Log out</ActionButton>
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      ) : null}

      {formState ? <UserFormModal mode={formState.mode} initial={formState.user} roles={roles.data ?? []} permissions={permissions.data ?? []} onClose={closeForm} onSubmit={formState.mode === 'edit' ? submitEdit : submitCreate} /> : null}
      {viewing ? <UserViewModal user={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}
