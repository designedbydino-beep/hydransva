/* @ds-bundle: {"format":4,"namespace":"NSVADesignSystem_b0b40f","components":[{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"StatusPill","sourcePath":"components/feedback/StatusPill.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Breadcrumb","sourcePath":"components/layout/Breadcrumb.jsx"},{"name":"Card","sourcePath":"components/layout/Card.jsx"},{"name":"Tabs","sourcePath":"components/layout/Tabs.jsx"}],"sourceHashes":{"components/feedback/Alert.jsx":"5abec05da8a4","components/feedback/Badge.jsx":"c057b631488f","components/feedback/StatusPill.jsx":"e65c082f3ec3","components/forms/Button.jsx":"bb35787c7fe1","components/forms/Checkbox.jsx":"325c4df9baf8","components/forms/Input.jsx":"833b006dd011","components/forms/Select.jsx":"37f851eba463","components/forms/Switch.jsx":"6d6254637372","components/layout/Breadcrumb.jsx":"f76a0812acbc","components/layout/Card.jsx":"7747ac5c3ec4","components/layout/Tabs.jsx":"f79026cde7aa","ui_kits/nsva-web/App.jsx":"7431601ef87f","ui_kits/nsva-web/DriftPage.jsx":"ae85f9f78fa6","ui_kits/nsva-web/FelanmalanPage.jsx":"3237a1cd5135","ui_kits/nsva-web/Footer.jsx":"37fef21a0e30","ui_kits/nsva-web/Header.jsx":"f987121706be","ui_kits/nsva-web/HomePage.jsx":"a547bc08a32b"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.NSVADesignSystem_b0b40f = window.NSVADesignSystem_b0b40f || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/feedback/Alert.jsx
try { (() => {
const CSS = `
.nsva-alert {
  font-family: var(--font-ui);
  display: flex; gap: 14px; align-items: flex-start;
  padding: 16px 18px; border-radius: var(--radius-md);
  border: 1px solid transparent;
}
.nsva-alert__icon { flex: 0 0 auto; width: 22px; height: 22px; margin-top: 1px; }
.nsva-alert__icon svg { width: 22px; height: 22px; display: block; }
.nsva-alert__body { flex: 1; min-width: 0; }
.nsva-alert__title { font-weight: var(--fw-bold); font-size: var(--text-base); margin: 0 0 2px; }
.nsva-alert__text { font-size: var(--text-sm); margin: 0; line-height: var(--leading-normal); }
.nsva-alert__text p { margin: 0 0 6px; }
.nsva-alert__text :last-child { margin-bottom: 0; }

.nsva-alert--info    { background: var(--status-info-bg);    border-color: #9fd2f4; color: var(--blue-01); }
.nsva-alert--success { background: var(--status-success-bg); border-color: #bcd9bf; color: var(--green-01); }
.nsva-alert--warning { background: var(--status-warning-bg); border-color: #f6d2b8; color: var(--rust-900); }
.nsva-alert--danger  { background: var(--red-02);          border-color: var(--red-02); color: #fff; }
`;
if (typeof document !== 'undefined' && !document.getElementById('nsva-alert-css')) {
  const s = document.createElement('style');
  s.id = 'nsva-alert-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const ICONS = {
  info: 'M12 16v-5M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
  success: 'M20 6 9 17l-5-5',
  warning: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  danger: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'
};

/**
 * NSVA driftnotis / inline message banner.
 */
function Alert({
  variant = 'info',
  title,
  children,
  className = '',
  ...rest
}) {
  return React.createElement('div', {
    className: ['nsva-alert', `nsva-alert--${variant}`, className].filter(Boolean).join(' '),
    role: 'status',
    ...rest
  }, React.createElement('span', {
    className: 'nsva-alert__icon'
  }, React.createElement('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  }, React.createElement('path', {
    d: ICONS[variant]
  }))), React.createElement('div', {
    className: 'nsva-alert__body'
  }, title && React.createElement('p', {
    className: 'nsva-alert__title'
  }, title), React.createElement('div', {
    className: 'nsva-alert__text'
  }, children)));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
const CSS = `
.nsva-badge {
  font-family: var(--font-ui);
  display: inline-flex; align-items: center; gap: 5px;
  font-size: var(--text-2xs); font-weight: var(--fw-bold);
  line-height: 1; padding: 5px 10px; border-radius: var(--radius-pill);
  letter-spacing: 0.01em; white-space: nowrap;
}
.nsva-badge--neutral { background: var(--grey-04); color: var(--grey-01); }
.nsva-badge--info    { background: var(--blue-04);  color: var(--blue-01); }
.nsva-badge--teal    { background: var(--teal-04);  color: var(--teal-01); }
.nsva-badge--success { background: var(--green-04); color: var(--green-01); }
.nsva-badge--warning { background: var(--red-04);   color: var(--red-01); }
.nsva-badge--danger  { background: var(--red-02);   color: #fff; }
.nsva-badge--purple  { background: var(--purple-04);color: var(--purple-01); }
.nsva-badge--solid   { background: var(--blue-01);  color: #fff; }
`;
if (typeof document !== 'undefined' && !document.getElementById('nsva-badge-css')) {
  const s = document.createElement('style');
  s.id = 'nsva-badge-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * NSVA badge / tag — small categorical label.
 */
function Badge({
  variant = 'neutral',
  className = '',
  children,
  ...rest
}) {
  return React.createElement('span', {
    className: ['nsva-badge', `nsva-badge--${variant}`, className].filter(Boolean).join(' '),
    ...rest
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StatusPill.jsx
try { (() => {
const CSS = `
.nsva-status {
  font-family: var(--font-ui);
  display: inline-flex; align-items: center; gap: 8px;
  font-size: var(--text-xs); font-weight: var(--fw-bold);
  padding: 6px 13px 6px 11px; border-radius: var(--radius-pill);
  border: 1px solid transparent; white-space: nowrap;
}
.nsva-status__dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
.nsva-status--ongoing  { background: var(--red-04);   color: var(--red-01);   border-color: #f6d2b8; }
.nsva-status--ongoing  .nsva-status__dot { background: var(--red-02); animation: nsva-pulse 1.6s var(--ease-in-out) infinite; }
.nsva-status--planned  { background: var(--blue-04);  color: var(--blue-01);  border-color: #9fd2f4; }
.nsva-status--planned  .nsva-status__dot { background: var(--blue-02); }
.nsva-status--resolved { background: var(--green-04); color: var(--green-01); border-color: #bcd9bf; }
.nsva-status--resolved .nsva-status__dot { background: var(--green-02); }
.nsva-status--info     { background: var(--grey-04);  color: var(--grey-01); }
.nsva-status--info     .nsva-status__dot { background: var(--grey-02); }
@keyframes nsva-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .nsva-status--ongoing .nsva-status__dot { animation: none; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('nsva-status-css')) {
  const s = document.createElement('style');
  s.id = 'nsva-status-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const LABELS = {
  ongoing: 'Pågår',
  planned: 'Planerat',
  resolved: 'Åtgärdat',
  info: 'Information'
};

/**
 * NSVA operational status pill (driftstatus) with a state dot.
 */
function StatusPill({
  status = 'info',
  children,
  className = '',
  ...rest
}) {
  return React.createElement('span', {
    className: ['nsva-status', `nsva-status--${status}`, className].filter(Boolean).join(' '),
    ...rest
  }, React.createElement('span', {
    className: 'nsva-status__dot'
  }), children || LABELS[status]);
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
const CSS = `
.nsva-btn {
  font-family: var(--font-ui);
  font-weight: var(--fw-bold);
  display: inline-flex; align-items: center; justify-content: center; gap: 0.5em;
  border: 1.5px solid transparent;
  border-radius: var(--radius-pill);
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.nsva-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.nsva-btn:active { transform: translateY(1px); }
.nsva-btn[disabled] { opacity: 0.45; cursor: not-allowed; transform: none; }

/* sizes */
.nsva-btn--sm { font-size: var(--text-sm); padding: 7px 16px; }
.nsva-btn--md { font-size: var(--text-base); padding: 10px 22px; }
.nsva-btn--lg { font-size: var(--text-md); padding: 14px 30px; }

/* variants */
.nsva-btn--primary { background: var(--color-primary); color: var(--color-on-primary); }
.nsva-btn--primary:hover:not([disabled]) { background: var(--color-primary-hover); }
.nsva-btn--primary:active:not([disabled]) { background: var(--color-primary-active); }

.nsva-btn--secondary { background: transparent; color: var(--color-primary); border-color: var(--color-primary); }
.nsva-btn--secondary:hover:not([disabled]) { background: var(--blue-04); }

.nsva-btn--ghost { background: transparent; color: var(--color-primary); }
.nsva-btn--ghost:hover:not([disabled]) { background: var(--blue-04); }

.nsva-btn--danger { background: var(--status-danger); color: #fff; }
.nsva-btn--danger:hover:not([disabled]) { background: #b82d0c; }

.nsva-btn--full { width: 100%; }
`;
if (typeof document !== 'undefined' && !document.getElementById('nsva-btn-css')) {
  const s = document.createElement('style');
  s.id = 'nsva-btn-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * NSVA primary action button. Pill-shaped, brand-blue.
 */
function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  as = 'button',
  className = '',
  children,
  ...rest
}) {
  const Tag = as;
  const cls = ['nsva-btn', `nsva-btn--${variant}`, `nsva-btn--${size}`, fullWidth ? 'nsva-btn--full' : '', className].filter(Boolean).join(' ');
  return React.createElement(Tag, {
    className: cls,
    ...rest
  }, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
const CSS = `
.nsva-check { display: inline-flex; align-items: flex-start; gap: 10px; font-family: var(--font-ui); cursor: pointer; font-size: var(--text-base); color: var(--text-body); }
.nsva-check input { position: absolute; opacity: 0; width: 0; height: 0; }
.nsva-check__box {
  flex: 0 0 auto; width: 20px; height: 20px; margin-top: 1px;
  border: 1.5px solid var(--border-strong); border-radius: var(--radius-xs);
  background: var(--surface-card); display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.nsva-check__box svg { width: 13px; height: 13px; opacity: 0; transform: scale(0.6); transition: all var(--dur-fast) var(--ease-out); }
.nsva-check input:checked + .nsva-check__box { background: var(--color-primary); border-color: var(--color-primary); }
.nsva-check input:checked + .nsva-check__box svg { opacity: 1; transform: scale(1); }
.nsva-check input:focus-visible + .nsva-check__box { box-shadow: var(--focus-ring); }
.nsva-check input:disabled ~ * { opacity: 0.45; }
.nsva-check--disabled { cursor: not-allowed; }
`;
if (typeof document !== 'undefined' && !document.getElementById('nsva-check-css')) {
  const s = document.createElement('style');
  s.id = 'nsva-check-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * NSVA checkbox with label.
 */
function Checkbox({
  label,
  disabled = false,
  className = '',
  ...rest
}) {
  return React.createElement('label', {
    className: ['nsva-check', disabled ? 'nsva-check--disabled' : '', className].filter(Boolean).join(' ')
  }, React.createElement('input', {
    type: 'checkbox',
    disabled,
    ...rest
  }), React.createElement('span', {
    className: 'nsva-check__box'
  }, React.createElement('svg', {
    viewBox: '0 0 16 16',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg'
  }, React.createElement('path', {
    d: 'M2.5 8.5l3.5 3.5 7.5-8',
    stroke: '#fff',
    strokeWidth: 2.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  }))), label && React.createElement('span', null, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
const CSS = `
.nsva-field { display: flex; flex-direction: column; gap: 6px; font-family: var(--font-ui); }
.nsva-field__label { font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--text-strong); }
.nsva-field__req { color: var(--status-danger); margin-left: 2px; }
.nsva-field__hint { font-size: var(--text-xs); color: var(--text-muted); }
.nsva-field__error { font-size: var(--text-xs); color: var(--status-danger); font-weight: var(--fw-semibold); }
.nsva-input {
  font-family: var(--font-ui);
  font-size: var(--text-base);
  color: var(--text-strong);
  background: var(--surface-card);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: 11px 14px;
  width: 100%;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.nsva-input::placeholder { color: var(--text-muted); }
.nsva-input:hover:not(:disabled) { border-color: var(--border-strong); }
.nsva-input:focus { outline: none; border-color: var(--border-focus); box-shadow: var(--focus-ring); }
.nsva-input:disabled { background: var(--surface-sunken); color: var(--text-muted); cursor: not-allowed; }
.nsva-input--invalid { border-color: var(--status-danger); }
.nsva-input--invalid:focus { box-shadow: 0 0 0 3px rgba(220,57,16,0.30); }
`;
if (typeof document !== 'undefined' && !document.getElementById('nsva-input-css')) {
  const s = document.createElement('style');
  s.id = 'nsva-input-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * NSVA text input with optional label, hint and error.
 */
function Input({
  label,
  hint,
  error,
  required = false,
  id,
  className = '',
  ...rest
}) {
  const fieldId = id || `nsva-${Math.random().toString(36).slice(2, 8)}`;
  const inputCls = ['nsva-input', error ? 'nsva-input--invalid' : '', className].filter(Boolean).join(' ');
  return React.createElement('div', {
    className: 'nsva-field'
  }, label && React.createElement('label', {
    className: 'nsva-field__label',
    htmlFor: fieldId
  }, label, required && React.createElement('span', {
    className: 'nsva-field__req'
  }, '*')), React.createElement('input', {
    id: fieldId,
    className: inputCls,
    'aria-invalid': !!error,
    ...rest
  }), error ? React.createElement('span', {
    className: 'nsva-field__error'
  }, error) : hint && React.createElement('span', {
    className: 'nsva-field__hint'
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
const CSS = `
.nsva-select-wrap { position: relative; display: inline-block; width: 100%; font-family: var(--font-ui); }
.nsva-select {
  appearance: none; -webkit-appearance: none;
  font-family: var(--font-ui); font-size: var(--text-base); color: var(--text-strong);
  background: var(--surface-card);
  border: 1.5px solid var(--border-default); border-radius: var(--radius-sm);
  padding: 11px 40px 11px 14px; width: 100%; cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.nsva-select:hover:not(:disabled) { border-color: var(--border-strong); }
.nsva-select:focus { outline: none; border-color: var(--border-focus); box-shadow: var(--focus-ring); }
.nsva-select:disabled { background: var(--surface-sunken); color: var(--text-muted); cursor: not-allowed; }
.nsva-select-wrap::after {
  content: ''; position: absolute; right: 16px; top: 50%; width: 9px; height: 9px;
  border-right: 2px solid var(--grey-02); border-bottom: 2px solid var(--grey-02);
  transform: translateY(-65%) rotate(45deg); pointer-events: none;
}
`;
if (typeof document !== 'undefined' && !document.getElementById('nsva-select-css')) {
  const s = document.createElement('style');
  s.id = 'nsva-select-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * NSVA dropdown select. Pass options as [{value,label}] or use children <option>.
 */
function Select({
  options,
  placeholder,
  className = '',
  children,
  ...rest
}) {
  return React.createElement('div', {
    className: 'nsva-select-wrap'
  }, React.createElement('select', {
    className: ['nsva-select', className].filter(Boolean).join(' '),
    ...rest
  }, placeholder && React.createElement('option', {
    value: '',
    disabled: true
  }, placeholder), options ? options.map(o => React.createElement('option', {
    key: o.value,
    value: o.value
  }, o.label)) : children));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
const CSS = `
.nsva-switch { display: inline-flex; align-items: center; gap: 10px; font-family: var(--font-ui); cursor: pointer; font-size: var(--text-base); color: var(--text-body); }
.nsva-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.nsva-switch__track {
  width: 44px; height: 24px; border-radius: var(--radius-pill); background: var(--grey-04);
  position: relative; transition: background var(--dur-base) var(--ease-out); flex: 0 0 auto;
}
.nsva-switch__thumb {
  position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; box-shadow: var(--shadow-sm); transition: transform var(--dur-base) var(--ease-out);
}
.nsva-switch input:checked + .nsva-switch__track { background: var(--color-primary); }
.nsva-switch input:checked + .nsva-switch__track .nsva-switch__thumb { transform: translateX(20px); }
.nsva-switch input:focus-visible + .nsva-switch__track { box-shadow: var(--focus-ring); }
.nsva-switch input:disabled ~ * { opacity: 0.45; }
`;
if (typeof document !== 'undefined' && !document.getElementById('nsva-switch-css')) {
  const s = document.createElement('style');
  s.id = 'nsva-switch-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * NSVA toggle switch.
 */
function Switch({
  label,
  disabled = false,
  className = '',
  ...rest
}) {
  return React.createElement('label', {
    className: ['nsva-switch', className].filter(Boolean).join(' ')
  }, React.createElement('input', {
    type: 'checkbox',
    role: 'switch',
    disabled,
    ...rest
  }), React.createElement('span', {
    className: 'nsva-switch__track'
  }, React.createElement('span', {
    className: 'nsva-switch__thumb'
  })), label && React.createElement('span', null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/layout/Breadcrumb.jsx
try { (() => {
const CSS = `
.nsva-crumbs { font-family: var(--font-ui); font-size: var(--text-sm); display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--text-muted); }
.nsva-crumbs a { color: var(--text-muted); text-decoration: none; }
.nsva-crumbs a:hover { color: var(--text-link); text-decoration: underline; }
.nsva-crumbs__sep { color: var(--grey-03); user-select: none; }
.nsva-crumbs__current { color: var(--text-strong); font-weight: var(--fw-bold); }
`;
if (typeof document !== 'undefined' && !document.getElementById('nsva-crumbs-css')) {
  const s = document.createElement('style');
  s.id = 'nsva-crumbs-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * NSVA breadcrumb trail. Pass items as [{label, href}]; last item is current.
 */
function Breadcrumb({
  items = [],
  separator = '/',
  className = '',
  ...rest
}) {
  return React.createElement('nav', {
    'aria-label': 'Brödsmulor',
    className: ['nsva-crumbs', className].filter(Boolean).join(' '),
    ...rest
  }, items.map((item, i) => {
    const last = i === items.length - 1;
    return React.createElement(React.Fragment, {
      key: i
    }, last ? React.createElement('span', {
      className: 'nsva-crumbs__current',
      'aria-current': 'page'
    }, item.label) : React.createElement('a', {
      href: item.href || '#'
    }, item.label), !last && React.createElement('span', {
      className: 'nsva-crumbs__sep'
    }, separator));
  }));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/layout/Card.jsx
try { (() => {
const CSS = `
.nsva-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  font-family: var(--font-ui);
  display: flex; flex-direction: column;
}
.nsva-card--shadow { box-shadow: var(--shadow-sm); border-color: transparent; }
.nsva-card--interactive { cursor: pointer; transition: transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out); }
.nsva-card--interactive:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
.nsva-card__media { display: block; width: 100%; height: 100%; object-fit: cover; }
.nsva-card__media-wrap { aspect-ratio: 16 / 9; background: var(--blue-04); overflow: hidden; }
.nsva-card__body { padding: var(--space-5) var(--space-5) var(--space-6); display: flex; flex-direction: column; gap: 8px; }
.nsva-card__eyebrow { font-size: var(--text-2xs); font-weight: 700; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--color-primary); }
.nsva-card__title { font-family: var(--font-heading); font-weight: 700; font-size: var(--text-lg); color: var(--text-strong); margin: 0; line-height: var(--leading-snug); }
.nsva-card__text { font-family: var(--font-body); font-size: var(--text-sm); color: var(--text-body); margin: 0; line-height: var(--leading-normal); }
.nsva-card__footer { margin-top: auto; padding: var(--space-4) var(--space-5); border-top: 1px solid var(--border-subtle); }
`;
if (typeof document !== 'undefined' && !document.getElementById('nsva-card-css')) {
  const s = document.createElement('style');
  s.id = 'nsva-card-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * NSVA content card. White surface, soft rounding, hairline border.
 */
function Card({
  eyebrow,
  title,
  media,
  footer,
  shadow = false,
  interactive = false,
  className = '',
  children,
  ...rest
}) {
  const cls = ['nsva-card', shadow ? 'nsva-card--shadow' : '', interactive ? 'nsva-card--interactive' : '', className].filter(Boolean).join(' ');
  return React.createElement('div', {
    className: cls,
    ...rest
  }, media && React.createElement('div', {
    className: 'nsva-card__media-wrap'
  }, typeof media === 'string' ? React.createElement('img', {
    className: 'nsva-card__media',
    src: media,
    alt: title || ''
  }) : media), React.createElement('div', {
    className: 'nsva-card__body'
  }, eyebrow && React.createElement('span', {
    className: 'nsva-card__eyebrow'
  }, eyebrow), title && React.createElement('h3', {
    className: 'nsva-card__title'
  }, title), children && React.createElement('div', {
    className: 'nsva-card__text'
  }, children)), footer && React.createElement('div', {
    className: 'nsva-card__footer'
  }, footer));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Card.jsx", error: String((e && e.message) || e) }); }

// components/layout/Tabs.jsx
try { (() => {
const CSS = `
.nsva-tabs__list {
  display: flex; gap: 4px; border-bottom: 2px solid var(--border-default);
  font-family: var(--font-ui); overflow-x: auto;
}
.nsva-tab {
  appearance: none; border: 0; background: none; cursor: pointer;
  font-family: var(--font-ui); font-size: var(--text-base); font-weight: var(--fw-medium);
  color: var(--text-muted); padding: 12px 16px; position: relative;
  border-bottom: 3px solid transparent; margin-bottom: -2px; white-space: nowrap;
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.nsva-tab:hover { color: var(--text-strong); }
.nsva-tab--active { color: var(--blue-01); font-weight: var(--fw-bold); border-bottom-color: var(--blue-02); }
.nsva-tab:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--radius-xs); }
.nsva-tabs__panel { padding-top: var(--space-5); font-family: var(--font-body); color: var(--text-body); }
`;
if (typeof document !== 'undefined' && !document.getElementById('nsva-tabs-css')) {
  const s = document.createElement('style');
  s.id = 'nsva-tabs-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * NSVA underline tabs. Uncontrolled by default; pass value+onChange to control.
 */
function Tabs({
  tabs = [],
  value,
  defaultValue,
  onChange,
  className = '',
  children
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? (tabs[0] && tabs[0].id));
  const active = value !== undefined ? value : internal;
  const select = id => {
    if (value === undefined) setInternal(id);
    onChange && onChange(id);
  };
  const activeTab = tabs.find(t => t.id === active);
  return React.createElement('div', {
    className: ['nsva-tabs', className].filter(Boolean).join(' ')
  }, React.createElement('div', {
    className: 'nsva-tabs__list',
    role: 'tablist'
  }, tabs.map(t => React.createElement('button', {
    key: t.id,
    role: 'tab',
    'aria-selected': t.id === active,
    className: ['nsva-tab', t.id === active ? 'nsva-tab--active' : ''].filter(Boolean).join(' '),
    onClick: () => select(t.id)
  }, t.label))), (children || activeTab && activeTab.content) && React.createElement('div', {
    className: 'nsva-tabs__panel',
    role: 'tabpanel'
  }, children || activeTab.content));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nsva-web/App.jsx
try { (() => {
// NSVA web — App shell + router. Mounts Header/Footer and routes between pages.
const {
  Tabs: ATabs,
  Breadcrumb: ACrumb,
  Card: ACard,
  Button: ABtn
} = window.NSVADesignSystem_b0b40f;
const TAXA = {
  Helsingborg: 'VA-taxan i Helsingborg justeras inför 2024 — de största justeringarna vi någonsin föreslagit. Det behövs för att bygga ett VA som håller för framtiden.',
  Landskrona: 'Se aktuell brukningsavgift och anläggningsavgift för Landskrona stad. Avgiften finansierar drift, underhåll och förnyelse av ledningsnätet.',
  Båstad: 'Båstads sydsida ansluts till dricksvattenproducenten Sydvatten. Taxan speglar de investeringar som krävs för en trygg vattenförsörjning.',
  Svalöv: 'Brukningsavgiften i Svalöv består av en fast och en rörlig del baserad på din uppmätta förbrukning i m³.'
};
function AvgifterPage() {
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement(ACrumb, {
    items: [{
      label: 'Start',
      href: '#'
    }, {
      label: 'Avgifter & taxa'
    }]
  }), /*#__PURE__*/React.createElement("span", {
    className: "page__eyebrow"
  }, "Avgifter & taxa"), /*#__PURE__*/React.createElement("h1", null, "Vad kostar vatten och avlopp?"), /*#__PURE__*/React.createElement("p", {
    className: "page__lead"
  }, "Kostnaden f\xF6r vatten och avlopp finansieras helt genom avgifter \u2014 inga skattemedel. Taxan beslutas av varje \xE4garkommun. V\xE4lj din kommun nedan."), /*#__PURE__*/React.createElement("div", {
    className: "panel-card"
  }, /*#__PURE__*/React.createElement(ATabs, {
    tabs: Object.keys(TAXA).map(k => ({
      id: k,
      label: k,
      content: /*#__PURE__*/React.createElement("div", {
        className: "taxa"
      }, /*#__PURE__*/React.createElement("p", null, TAXA[k]), /*#__PURE__*/React.createElement("div", {
        className: "taxa__figures"
      }, /*#__PURE__*/React.createElement("div", {
        className: "figure"
      }, /*#__PURE__*/React.createElement("span", {
        className: "figure__v mono"
      }, "12,84 kr"), /*#__PURE__*/React.createElement("span", {
        className: "figure__k"
      }, "per m\xB3 (r\xF6rlig avgift)")), /*#__PURE__*/React.createElement("div", {
        className: "figure"
      }, /*#__PURE__*/React.createElement("span", {
        className: "figure__v mono"
      }, "2 950 kr"), /*#__PURE__*/React.createElement("span", {
        className: "figure__k"
      }, "fast avgift / \xE5r")), /*#__PURE__*/React.createElement("div", {
        className: "figure"
      }, /*#__PURE__*/React.createElement("span", {
        className: "figure__v mono"
      }, "272 009"), /*#__PURE__*/React.createElement("span", {
        className: "figure__k"
      }, "fakturor skickade 2023"))), /*#__PURE__*/React.createElement(ABtn, {
        variant: "secondary",
        size: "sm"
      }, "F\xF6rklaring av VA-taxan"))
    }))
  }))));
}
function InfoPage({
  route,
  onNavigate
}) {
  const META = {
    dricksvatten: {
      crumb: 'Dricksvatten',
      eyebrow: 'Dricksvatten',
      h: 'Rent vatten ur kranen, året om',
      lead: 'NSVA ser till att det varje dag kommer rent och friskt dricksvatten till cirka 270 000 invånare och företag i nordvästra Skåne.',
      tiles: ['Vattenkvalitet', 'Hårt eller mjukt vatten', 'PFAS', 'Spara vatten-tips', 'Vattenmätare', 'Drick kranvatten']
    },
    avlopp: {
      crumb: 'Avlopp & dagvatten',
      eyebrow: 'Avlopp & dagvatten',
      h: 'Vi renar och leder bort vatten',
      lead: 'Via flera hundra mil ledningsnät tar vi hand om spillvatten och dagvatten, renar det och ser till att det är fritt från gifter när det släpps ut.',
      tiles: ['Stopp i avloppet', 'Häll inte fett i avloppet', 'Översvämning', 'Fettavskiljare', 'Anslutningskrav', 'LTA-anläggning']
    },
    om: {
      crumb: 'Om NSVA',
      eyebrow: 'Om NSVA',
      h: 'Ett bolag för samverkan',
      lead: 'NSVA bildades 2009 och ägs gemensamt av åtta kommuner. Genom att samverka kan vi planera och investera effektivt för framtidens VA.',
      tiles: ['Om företaget', 'Jobba hos oss', 'Press & nyheter', 'Hållbarhet', 'Projektwebben', 'Kontakta oss']
    }
  };
  const m = META[route] || META.dricksvatten;
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement(ACrumb, {
    items: [{
      label: 'Start',
      href: '#'
    }, {
      label: m.crumb
    }]
  }), /*#__PURE__*/React.createElement("span", {
    className: "page__eyebrow"
  }, m.eyebrow), /*#__PURE__*/React.createElement("h1", null, m.h), /*#__PURE__*/React.createElement("p", {
    className: "page__lead"
  }, m.lead), /*#__PURE__*/React.createElement("div", {
    className: "grid-3"
  }, m.tiles.map(t => /*#__PURE__*/React.createElement("a", {
    key: t,
    className: "linktile",
    href: "#",
    onClick: e => e.preventDefault()
  }, /*#__PURE__*/React.createElement("span", null, t), /*#__PURE__*/React.createElement("i", {
    "data-lucide": "arrow-right"
  }))))));
}
function App() {
  const [route, setRoute] = React.useState('home');
  const go = r => {
    setRoute(r);
    window.scrollTo({
      top: 0
    });
  };
  React.useEffect(() => {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  });
  let page;
  if (route === 'home') page = /*#__PURE__*/React.createElement(HomePage, {
    onNavigate: go
  });else if (route === 'drift') page = /*#__PURE__*/React.createElement(DriftPage, {
    onNavigate: go
  });else if (route === 'felanmalan') page = /*#__PURE__*/React.createElement(FelanmalanPage, null);else if (route === 'avgifter') page = /*#__PURE__*/React.createElement(AvgifterPage, null);else page = /*#__PURE__*/React.createElement(InfoPage, {
    route: route,
    onNavigate: go
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "site"
  }, /*#__PURE__*/React.createElement(Header, {
    route: route,
    onNavigate: go
  }), /*#__PURE__*/React.createElement("main", null, page), /*#__PURE__*/React.createElement(Footer, {
    onNavigate: go
  }));
}
function mountApp() {
  const ns = window.NSVADesignSystem_b0b40f;
  const ready = window.Header && window.Footer && window.HomePage && window.DriftPage && window.FelanmalanPage && ns && ns.Button;
  if (!ready) {
    setTimeout(mountApp, 30);
    return;
  }
  if (window.__nsvaRoot) return;
  window.__nsvaRoot = ReactDOM.createRoot(document.getElementById('root'));
  window.__nsvaRoot.render(/*#__PURE__*/React.createElement(App, null));
}
mountApp();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nsva-web/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nsva-web/DriftPage.jsx
try { (() => {
// NSVA web — Driftinformation (operational status list)
const {
  StatusPill: DStatus,
  Badge: DBadge,
  Breadcrumb: DCrumb,
  Select: DSelect,
  Card: DCard
} = window.NSVADesignSystem_b0b40f;
const INCIDENTS = [{
  status: 'ongoing',
  kommun: 'Helsingborg',
  cat: 'Vattenläcka',
  title: 'Vattenläcka i Ramlösa',
  area: 'Ramlösa, Helsingborg',
  text: 'En större läcka har uppstått på ledningsnätet. Hela Helsingborg kan uppleva lägre tryck tills läckan är lagad. Lagningsarbetet är påbörjat.',
  time: 'Uppdaterad idag 08:14'
}, {
  status: 'planned',
  kommun: 'Svalöv',
  cat: 'Planerat underhåll',
  title: 'Planerat underhåll — vattnet stängs av',
  area: 'Teckomatorp, Svalöv',
  text: 'Vattnet stängs av tillfälligt natten mot onsdag kl 23–05 för ledningsarbete. Tappa upp vatten för eget behov i förväg.',
  time: 'Gäller 25 jun 23:00–05:00'
}, {
  status: 'ongoing',
  kommun: 'Båstad',
  cat: 'Bevattningsförbud',
  title: 'Bevattningsförbud råder',
  area: 'Hela Båstads kommun',
  text: 'Vattna inte med slang eller spridare. Spara vatten — nivåerna är historiskt låga. Gäller tills vidare.',
  time: 'Sedan 18 jun'
}, {
  status: 'resolved',
  kommun: 'Örkelljunga',
  cat: 'Kokningsrekommendation',
  title: 'Kokningsrekommendationen är hävd',
  area: 'Killhult, Örkelljunga',
  text: 'Proverna visar att dricksvattnet uppfyller alla kvalitetskrav och kan användas som vanligt igen.',
  time: 'Åtgärdat 21 jun'
}, {
  status: 'resolved',
  kommun: 'Helsingborg',
  cat: 'Vattenläcka',
  title: 'Lagad läcka — vattnet är åter',
  area: 'Eneborg, Helsingborg',
  text: 'Läckan är lagad och vattnet är tillbaka. Spola kallvatten en stund om vattnet är missfärgat.',
  time: 'Åtgärdat 20 jun'
}];
const KOMMUNER = ['Alla kommuner', 'Bjuv', 'Båstad', 'Helsingborg', 'Landskrona', 'Perstorp', 'Svalöv', 'Åstorp', 'Örkelljunga'];
function DriftPage({
  onNavigate
}) {
  const [kommun, setKommun] = React.useState('Alla kommuner');
  const [filter, setFilter] = React.useState('all');
  let list = INCIDENTS;
  if (kommun !== 'Alla kommuner') list = list.filter(i => i.kommun === kommun);
  if (filter !== 'all') list = list.filter(i => i.status === filter);
  const active = INCIDENTS.filter(i => i.status === 'ongoing').length;
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement(DCrumb, {
    items: [{
      label: 'Start',
      href: '#'
    }, {
      label: 'Driftinformation'
    }]
  }), /*#__PURE__*/React.createElement("div", {
    className: "page__head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "page__eyebrow"
  }, "Om n\xE5got g\xE5r snett"), /*#__PURE__*/React.createElement("h1", null, "Driftinformation"), /*#__PURE__*/React.createElement("p", {
    className: "page__lead"
  }, "Aktuella driftst\xF6rningar, planerat underh\xE5ll och vattenavst\xE4ngningar \u2014 uppdateras dygnet runt.")), /*#__PURE__*/React.createElement("div", {
    className: "drift__summary"
  }, /*#__PURE__*/React.createElement("span", {
    className: "drift__count"
  }, active), /*#__PURE__*/React.createElement("span", {
    className: "drift__count-label"
  }, "p\xE5g\xE5ende", /*#__PURE__*/React.createElement("br", null), "st\xF6rningar"))), /*#__PURE__*/React.createElement("div", {
    className: "drift__layout"
  }, /*#__PURE__*/React.createElement("div", {
    className: "drift__main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "drift__toolbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "seg"
  }, [['all', 'Alla'], ['ongoing', 'Pågår'], ['planned', 'Planerat'], ['resolved', 'Åtgärdat']].map(([id, l]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    className: 'seg__btn' + (filter === id ? ' is-active' : ''),
    onClick: () => setFilter(id)
  }, l))), /*#__PURE__*/React.createElement("div", {
    className: "drift__kommun"
  }, /*#__PURE__*/React.createElement(DSelect, {
    value: kommun,
    onChange: e => setKommun(e.target.value),
    options: KOMMUNER.map(k => ({
      value: k,
      label: k
    }))
  }))), /*#__PURE__*/React.createElement("ul", {
    className: "incidents"
  }, list.map((i, idx) => /*#__PURE__*/React.createElement("li", {
    className: "incident",
    key: idx
  }, /*#__PURE__*/React.createElement("div", {
    className: "incident__top"
  }, /*#__PURE__*/React.createElement(DStatus, {
    status: i.status
  }), /*#__PURE__*/React.createElement(DBadge, {
    variant: "neutral"
  }, i.cat), /*#__PURE__*/React.createElement("span", {
    className: "incident__time"
  }, i.time)), /*#__PURE__*/React.createElement("h3", {
    className: "incident__title"
  }, i.title), /*#__PURE__*/React.createElement("p", {
    className: "incident__area"
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "map-pin",
    style: {
      width: 15,
      height: 15
    }
  }), " ", i.area), /*#__PURE__*/React.createElement("p", {
    className: "incident__text"
  }, i.text))), list.length === 0 && /*#__PURE__*/React.createElement("li", {
    className: "incident incident--empty"
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "check-circle-2",
    style: {
      width: 26,
      height: 26,
      color: 'var(--green-02)'
    }
  }), "Inga driftst\xF6rningar matchar ditt filter just nu."))), /*#__PURE__*/React.createElement("aside", {
    className: "drift__aside"
  }, /*#__PURE__*/React.createElement(DCard, {
    shadow: true,
    title: "Var sker st\xF6rningarna?",
    media: /*#__PURE__*/React.createElement("div", {
      className: "map-placeholder"
    }, /*#__PURE__*/React.createElement("i", {
      "data-lucide": "map",
      style: {
        width: 30,
        height: 30,
        color: 'var(--blue-02)'
      }
    }), /*#__PURE__*/React.createElement("span", null, "Karta \xF6ver nordv\xE4stra Sk\xE5ne"))
  }, "Mark\xF6rer visar p\xE5g\xE5ende och planerade arbeten i \xE4garkommunerna."), /*#__PURE__*/React.createElement("div", {
    className: "notify"
  }, /*#__PURE__*/React.createElement("h4", null, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "bell",
    style: {
      width: 18,
      height: 18
    }
  }), " F\xE5 avisering"), /*#__PURE__*/React.createElement("p", null, "Prenumerera p\xE5 driftinformation och f\xE5 sms eller mejl vid st\xF6rningar d\xE4r du bor."), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    className: "notify__link"
  }, "Hantera aviseringar \u2192"))))));
}
Object.assign(window, {
  DriftPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nsva-web/DriftPage.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nsva-web/FelanmalanPage.jsx
try { (() => {
// NSVA web — Felanmälan (report a fault) — multi-step interactive form
const {
  Button: FBtn,
  Input: FInput,
  Select: FSelect,
  Checkbox: FCheck,
  Breadcrumb: FCrumb,
  Alert: FAlert,
  Badge: FBadge
} = window.NSVADesignSystem_b0b40f;
const CATEGORIES = [{
  id: 'lacka',
  icon: 'droplet-off',
  label: 'Vattenläcka',
  desc: 'På gatan eller kommunens ledning'
}, {
  id: 'stopp',
  icon: 'toilet',
  label: 'Stopp i avloppet',
  desc: 'Avlopp som inte rinner undan'
}, {
  id: 'kvalitet',
  icon: 'droplet',
  label: 'Missfärgat vatten',
  desc: 'Lukt, smak eller färg på vattnet'
}, {
  id: 'matare',
  icon: 'gauge',
  label: 'Fel på vattenmätare',
  desc: 'Stannat, läcker eller larmar'
}, {
  id: 'brunn',
  icon: 'circle-dot',
  label: 'Trasig gatubrunn',
  desc: 'Igensatt eller skadad dagvattenbrunn'
}, {
  id: 'tryck',
  icon: 'activity',
  label: 'Lågt vattentryck',
  desc: 'Svagt eller ojämnt tryck'
}];
function FelanmalanPage() {
  const [step, setStep] = React.useState(1);
  const [cat, setCat] = React.useState(null);
  const [acute, setAcute] = React.useState(false);
  const catObj = CATEGORIES.find(c => c.id === cat);
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap wrap--narrow"
  }, /*#__PURE__*/React.createElement(FCrumb, {
    items: [{
      label: 'Start',
      href: '#'
    }, {
      label: 'Om något går snett',
      href: '#'
    }, {
      label: 'Felanmälan'
    }]
  }), /*#__PURE__*/React.createElement("span", {
    className: "page__eyebrow"
  }, "Felanm\xE4lan"), /*#__PURE__*/React.createElement("h1", null, "Anm\xE4l ett fel"), /*#__PURE__*/React.createElement("p", {
    className: "page__lead"
  }, "Akuta fel tar vi emot dygnet runt. Beskriv vad som h\xE4nt s\xE5 hj\xE4lper vi dig s\xE5 snabbt vi kan."), /*#__PURE__*/React.createElement("ol", {
    className: "steps"
  }, ['Vad gäller det?', 'Dina uppgifter', 'Klart'].map((s, i) => /*#__PURE__*/React.createElement("li", {
    key: s,
    className: 'steps__item' + (step === i + 1 ? ' is-active' : '') + (step > i + 1 ? ' is-done' : '')
  }, /*#__PURE__*/React.createElement("span", {
    className: "steps__num"
  }, step > i + 1 ? /*#__PURE__*/React.createElement("i", {
    "data-lucide": "check",
    style: {
      width: 14,
      height: 14
    }
  }) : i + 1), s))), step === 1 && /*#__PURE__*/React.createElement("div", {
    className: "fcard"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cat-grid"
  }, CATEGORIES.map(c => /*#__PURE__*/React.createElement("button", {
    key: c.id,
    className: 'cat' + (cat === c.id ? ' is-selected' : ''),
    onClick: () => setCat(c.id)
  }, /*#__PURE__*/React.createElement("span", {
    className: "cat__ic"
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": c.icon
  })), /*#__PURE__*/React.createElement("span", {
    className: "cat__label"
  }, c.label), /*#__PURE__*/React.createElement("span", {
    className: "cat__desc"
  }, c.desc)))), /*#__PURE__*/React.createElement("div", {
    className: "fcard__foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fcard__hint"
  }, "Akut l\xE4ge med stor vattenl\xE4cka? Ring ", /*#__PURE__*/React.createElement("strong", null, "010-490 97 00"), "."), /*#__PURE__*/React.createElement(FBtn, {
    variant: "primary",
    disabled: !cat,
    onClick: () => setStep(2)
  }, "Forts\xE4tt"))), step === 2 && /*#__PURE__*/React.createElement("div", {
    className: "fcard"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fcard__selected"
  }, /*#__PURE__*/React.createElement(FBadge, {
    variant: "info"
  }, catObj?.label), /*#__PURE__*/React.createElement("button", {
    className: "linkbtn",
    onClick: () => setStep(1)
  }, "\xC4ndra")), /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-grid__full"
  }, /*#__PURE__*/React.createElement(FInput, {
    label: "Adress eller plats",
    placeholder: "T.ex. R\xF6nnowsgatan 12, Helsingborg",
    required: true
  })), /*#__PURE__*/React.createElement(FSelect, {
    placeholder: "V\xE4lj kommun",
    options: ['Bjuv', 'Båstad', 'Helsingborg', 'Landskrona', 'Perstorp', 'Svalöv', 'Åstorp', 'Örkelljunga'].map(k => ({
      value: k,
      label: k
    }))
  }), /*#__PURE__*/React.createElement(FInput, {
    label: "Ditt telefonnummer",
    placeholder: "07X-XXX XX XX",
    inputMode: "tel",
    required: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "form-grid__full"
  }, /*#__PURE__*/React.createElement("label", {
    className: "ta-label"
  }, "Beskriv felet"), /*#__PURE__*/React.createElement("textarea", {
    className: "ta",
    rows: 4,
    placeholder: "Beskriv vad du ser \u2014 n\xE4r det b\xF6rjade, omfattning, om vatten rinner upp p\xE5 gatan osv."
  })), /*#__PURE__*/React.createElement("div", {
    className: "form-grid__full"
  }, /*#__PURE__*/React.createElement(FCheck, {
    label: "Det \xE4r akut \u2014 vatten rinner upp p\xE5 gatan eller in i byggnad",
    checked: acute,
    onChange: e => setAcute(e.target.checked)
  }))), acute && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(FAlert, {
    variant: "danger",
    title: "Akut \xE4rende"
  }, "Vid akut vattenl\xE4cka, ring oss direkt p\xE5 010-490 97 00 s\xE5 hanterar vi det omg\xE5ende.")), /*#__PURE__*/React.createElement("div", {
    className: "fcard__foot"
  }, /*#__PURE__*/React.createElement(FBtn, {
    variant: "ghost",
    onClick: () => setStep(1)
  }, "Tillbaka"), /*#__PURE__*/React.createElement(FBtn, {
    variant: "primary",
    onClick: () => setStep(3)
  }, "Skicka anm\xE4lan"))), step === 3 && /*#__PURE__*/React.createElement("div", {
    className: "fcard fcard--center"
  }, /*#__PURE__*/React.createElement("span", {
    className: "done-ic"
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "check",
    style: {
      width: 34,
      height: 34
    }
  })), /*#__PURE__*/React.createElement("h2", null, "Tack \u2014 din anm\xE4lan \xE4r mottagen"), /*#__PURE__*/React.createElement("p", {
    className: "done-text"
  }, "\xC4rendenummer ", /*#__PURE__*/React.createElement("strong", {
    className: "mono"
  }, "NSVA-2026-04821"), ". Vi \xE5terkommer om vi beh\xF6ver mer information. Vid akuta fel arbetar v\xE5r jourstyrka dygnet runt."), /*#__PURE__*/React.createElement(FBtn, {
    variant: "secondary",
    onClick: () => {
      setStep(1);
      setCat(null);
      setAcute(false);
    }
  }, "G\xF6r en ny anm\xE4lan"))));
}
Object.assign(window, {
  FelanmalanPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nsva-web/FelanmalanPage.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nsva-web/Footer.jsx
try { (() => {
// NSVA web — shared Footer (navy, brand promise + link columns)
function Footer({
  onNavigate
}) {
  const cols = [{
    h: 'Dricksvatten',
    links: ['Vattenkvalitet', 'Hårt eller mjukt vatten', 'Spara vatten', 'Vattenmätare']
  }, {
    h: 'Avlopp & dagvatten',
    links: ['Stopp i avloppet', 'Fett i avloppet', 'Översvämning', 'Anslutning']
  }, {
    h: 'Om något går snett',
    links: ['Driftinformation', 'Vattenläcka', 'Bevattningsförbud', 'Om vattnet måste kokas']
  }, {
    h: 'Om NSVA',
    links: ['Om företaget', 'Jobba hos oss', 'Press & nyheter', 'Kontakta oss']
  }];
  return /*#__PURE__*/React.createElement("footer", {
    className: "site-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap footer__top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "footer__brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/nsva-logo-white.png",
    alt: "NSVA"
  }), /*#__PURE__*/React.createElement("p", {
    className: "footer__promise"
  }, /*#__PURE__*/React.createElement("strong", null, "Rent vatten."), " Ett jobb f\xF6r livet."), /*#__PURE__*/React.createElement("p", {
    className: "footer__org"
  }, "Nordv\xE4stra Sk\xE5nes Vatten och Avlopp AB", /*#__PURE__*/React.createElement("br", null), "R\xF6nnowsgatan 12, 252 25 Helsingborg")), /*#__PURE__*/React.createElement("div", {
    className: "footer__cols"
  }, cols.map(c => /*#__PURE__*/React.createElement("div", {
    className: "footer__col",
    key: c.h
  }, /*#__PURE__*/React.createElement("h4", null, c.h), /*#__PURE__*/React.createElement("ul", null, c.links.map(l => /*#__PURE__*/React.createElement("li", {
    key: l
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, l)))))))), /*#__PURE__*/React.createElement("div", {
    className: "wrap footer__bottom"
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 ", new Date().getFullYear(), " NSVA \xB7 Org.nr 556765-3786"), /*#__PURE__*/React.createElement("span", {
    className: "footer__owners"
  }, "Bjuv \xB7 B\xE5stad \xB7 Helsingborg \xB7 Landskrona \xB7 Perstorp \xB7 Sval\xF6v \xB7 \xC5storp \xB7 \xD6rkelljunga")));
}
Object.assign(window, {
  Footer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nsva-web/Footer.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nsva-web/Header.jsx
try { (() => {
// NSVA web — shared Header (utility strip + main nav)
// Uses brand components from the bundle namespace + Lucide icons.
const {
  Button: NsvaButton
} = window.NSVADesignSystem_b0b40f;
function Icon({
  name,
  size = 20,
  style
}) {
  return /*#__PURE__*/React.createElement("i", {
    "data-lucide": name,
    style: {
      width: size,
      height: size,
      display: 'inline-flex',
      ...style
    }
  });
}
const NAV = [{
  id: 'dricksvatten',
  label: 'Dricksvatten'
}, {
  id: 'avlopp',
  label: 'Avlopp & dagvatten'
}, {
  id: 'drift',
  label: 'Driftinformation'
}, {
  id: 'avgifter',
  label: 'Avgifter & taxa'
}, {
  id: 'om',
  label: 'Om NSVA'
}];
function Header({
  route,
  onNavigate
}) {
  const [kommun, setKommun] = React.useState('Helsingborg');
  return /*#__PURE__*/React.createElement("header", {
    className: "site-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "utility"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap utility__inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "utility__left"
  }, /*#__PURE__*/React.createElement("span", {
    className: "utility__item"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 15
  }), " ", kommun), /*#__PURE__*/React.createElement("span", {
    className: "utility__sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("a", {
    className: "utility__item",
    href: "#",
    onClick: e => e.preventDefault()
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "phone",
    size: 15
  }), " 010-490 97 00")), /*#__PURE__*/React.createElement("div", {
    className: "utility__right"
  }, /*#__PURE__*/React.createElement("a", {
    className: "utility__item",
    href: "#",
    onClick: e => e.preventDefault()
  }, "Kundservice"), /*#__PURE__*/React.createElement("a", {
    className: "utility__item",
    href: "#",
    onClick: e => e.preventDefault()
  }, "In English"), /*#__PURE__*/React.createElement("a", {
    className: "utility__item",
    href: "#",
    onClick: e => e.preventDefault()
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user",
    size: 15
  }), " Mina sidor")))), /*#__PURE__*/React.createElement("div", {
    className: "wrap mainbar"
  }, /*#__PURE__*/React.createElement("a", {
    className: "brand",
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('home');
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/nsva-logo-color.png",
    alt: "NSVA \u2014 Startsida"
  })), /*#__PURE__*/React.createElement("nav", {
    className: "mainnav"
  }, NAV.map(n => /*#__PURE__*/React.createElement("a", {
    key: n.id,
    href: "#",
    className: 'mainnav__link' + (route === n.id ? ' is-active' : ''),
    onClick: e => {
      e.preventDefault();
      onNavigate(n.id);
    }
  }, n.label))), /*#__PURE__*/React.createElement("div", {
    className: "mainbar__actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "iconbtn",
    "aria-label": "S\xF6k"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 20
  })), /*#__PURE__*/React.createElement(NsvaButton, {
    variant: "danger",
    size: "sm",
    onClick: () => onNavigate('felanmalan')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "triangle-alert",
    size: 16
  }), " Felanm\xE4lan"))));
}
Object.assign(window, {
  Header,
  Icon,
  NAV
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nsva-web/Header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/nsva-web/HomePage.jsx
try { (() => {
// NSVA web — Homepage
const {
  Button: HBtn,
  Card: HCard,
  Alert: HAlert,
  Badge: HBadge
} = window.NSVADesignSystem_b0b40f;
function Photo({
  label = 'Foto',
  icon = 'image',
  tint = 'var(--blue-04)',
  ic = 'var(--blue-02)',
  h
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "photo",
    style: {
      background: tint,
      height: h
    }
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": icon,
    style: {
      width: 30,
      height: 30,
      color: ic
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "photo__cap",
    style: {
      color: ic
    }
  }, label));
}
const QUICK = [{
  icon: 'gauge',
  label: 'Min förbrukning',
  route: 'felanmalan'
}, {
  icon: 'droplet',
  label: 'Vattenkvalitet',
  route: 'dricksvatten'
}, {
  icon: 'file-text',
  label: 'Min faktura',
  route: 'avgifter'
}, {
  icon: 'triangle-alert',
  label: 'Felanmälan',
  route: 'felanmalan'
}];
const SERVICES = [{
  eyebrow: 'Dricksvatten',
  title: 'Rent vatten ur kranen',
  text: 'Vi levererar friskt dricksvatten till cirka 270 000 invånare, dygnet runt, året om.',
  icon: 'droplet',
  tint: 'var(--blue-04)',
  ic: 'var(--blue-02)',
  route: 'dricksvatten'
}, {
  eyebrow: 'Avlopp',
  title: 'Vi renar avloppsvatten',
  text: 'Genom flera hundra mil ledningsnät tar vi hand om och renar spillvatten innan det släpps ut igen.',
  icon: 'waves',
  tint: 'var(--teal-04)',
  ic: 'var(--teal-02)',
  route: 'avlopp'
}, {
  eyebrow: 'Dagvatten',
  title: 'Hand om regn & smältvatten',
  text: 'Vi leder bort dagvatten och arbetar för att rusta samhället för både skyfall och torka.',
  icon: 'cloud-rain',
  tint: 'var(--green-04)',
  ic: 'var(--green-02)',
  route: 'avlopp'
}];
const TIPS = [{
  eyebrow: 'Råd & tips',
  title: 'Så använder du vattnet hållbart',
  text: 'Med små medel kan du spara många liter vatten varje dag.',
  icon: 'sprout',
  tint: 'var(--green-04)',
  ic: 'var(--green-02)'
}, {
  eyebrow: 'Råd & tips',
  title: 'Häll inte fett i avloppet',
  text: 'Fett stelnar i ledningarna och orsakar stopp. Torka ur stekpannan istället.',
  icon: 'utensils',
  tint: 'var(--teal-04)',
  ic: 'var(--teal-02)'
}, {
  eyebrow: 'Råd & tips',
  title: 'Gör dig redo för regn och torka',
  text: 'Med sommarvärmen kommer ofta både skyfall och torka. Var förberedd på båda.',
  icon: 'cloud-sun',
  tint: 'var(--rust-tint, var(--blue-04))',
  ic: 'var(--blue-02)'
}];
const SNETT = [{
  icon: 'droplet-off',
  label: 'Vattenläcka'
}, {
  icon: 'toilet',
  label: 'Stopp i avloppet'
}, {
  icon: 'house',
  label: 'Översvämning i källaren'
}, {
  icon: 'thermometer-snowflake',
  label: 'Fryst vattenmätare'
}];
function HomePage({
  onNavigate
}) {
  const [q, setQ] = React.useState('');
  return /*#__PURE__*/React.createElement("div", {
    className: "home"
  }, /*#__PURE__*/React.createElement("section", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap hero__grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero__copy"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hero__eyebrow"
  }, "Nordv\xE4stra Sk\xE5nes Vatten och Avlopp"), /*#__PURE__*/React.createElement("h1", null, "Hur kan vi hj\xE4lpa dig idag?"), /*#__PURE__*/React.createElement("p", {
    className: "hero__lead"
  }, "S\xF6k bland tj\xE4nster, r\xE5d och driftinformation \u2014 eller anm\xE4l ett fel direkt."), /*#__PURE__*/React.createElement("div", {
    className: "hero__search"
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "search"
  }), /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "S\xF6k, t.ex. \u201Dbevattningsf\xF6rbud\u201D eller \u201Dvattenm\xE4tare\u201D",
    "aria-label": "S\xF6k p\xE5 nsva.se"
  }), /*#__PURE__*/React.createElement(HBtn, {
    variant: "primary",
    size: "md"
  }, "S\xF6k")), /*#__PURE__*/React.createElement("div", {
    className: "hero__quick"
  }, QUICK.map(qk => /*#__PURE__*/React.createElement("button", {
    key: qk.label,
    className: "quickchip",
    onClick: () => onNavigate(qk.route)
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": qk.icon
  }), qk.label)))), /*#__PURE__*/React.createElement("div", {
    className: "hero__media"
  }, /*#__PURE__*/React.createElement(Photo, {
    label: "Dricksvatten i Sk\xE5ne",
    icon: "droplets",
    tint: "rgba(255,255,255,.10)",
    ic: "rgba(255,255,255,.85)",
    h: 320
  })))), /*#__PURE__*/React.createElement("section", {
    className: "wrap section"
  }, /*#__PURE__*/React.createElement(HAlert, {
    variant: "warning",
    title: "Spara vatten \u2014 l\xE5ga vattenniv\xE5er i s\xF6dra Sverige"
  }, "Niv\xE5erna i sj\xF6ar och grundvatten \xE4r historiskt l\xE5ga. Alla beh\xF6ver hj\xE4lpas \xE5t att spara vatten.", ' ', /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('drift');
    }
  }, "Se driftinformation och tips \u2192"))), /*#__PURE__*/React.createElement("section", {
    className: "wrap section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section__head"
  }, /*#__PURE__*/React.createElement("h2", null, "Vad vi g\xF6r"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('om');
    }
  }, "Om NSVA \u2192")), /*#__PURE__*/React.createElement("div", {
    className: "grid-3"
  }, SERVICES.map(s => /*#__PURE__*/React.createElement(HCard, {
    key: s.title,
    shadow: true,
    interactive: true,
    eyebrow: s.eyebrow,
    title: s.title,
    media: /*#__PURE__*/React.createElement(Photo, {
      label: s.eyebrow,
      icon: s.icon,
      tint: s.tint,
      ic: s.ic
    }),
    footer: /*#__PURE__*/React.createElement("a", {
      href: "#",
      onClick: e => {
        e.preventDefault();
        onNavigate(s.route);
      }
    }, "L\xE4s mer")
  }, s.text)))), /*#__PURE__*/React.createElement("section", {
    className: "snett-band"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section__head section__head--light"
  }, /*#__PURE__*/React.createElement("h2", null, "Om n\xE5got g\xE5r snett"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('felanmalan');
    }
  }, "Alla felanm\xE4lningar \u2192")), /*#__PURE__*/React.createElement("div", {
    className: "grid-4"
  }, SNETT.map(s => /*#__PURE__*/React.createElement("button", {
    key: s.label,
    className: "snett-tile",
    onClick: () => onNavigate('felanmalan')
  }, /*#__PURE__*/React.createElement("span", {
    className: "snett-tile__ic"
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": s.icon
  })), /*#__PURE__*/React.createElement("span", {
    className: "snett-tile__label"
  }, s.label), /*#__PURE__*/React.createElement("i", {
    "data-lucide": "arrow-right",
    className: "snett-tile__arrow"
  })))))), /*#__PURE__*/React.createElement("section", {
    className: "wrap section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section__head"
  }, /*#__PURE__*/React.createElement("h2", null, "R\xE5d & tips"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, "Fler tips \u2192")), /*#__PURE__*/React.createElement("div", {
    className: "grid-3"
  }, TIPS.map(t => /*#__PURE__*/React.createElement(HCard, {
    key: t.title,
    shadow: true,
    interactive: true,
    eyebrow: t.eyebrow,
    title: t.title,
    media: /*#__PURE__*/React.createElement(Photo, {
      label: "Tips",
      icon: t.icon,
      tint: t.tint,
      ic: t.ic
    }),
    footer: /*#__PURE__*/React.createElement("a", {
      href: "#",
      onClick: e => e.preventDefault()
    }, "L\xE4s mer")
  }, t.text)))));
}
Object.assign(window, {
  HomePage,
  Photo
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/nsva-web/HomePage.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
