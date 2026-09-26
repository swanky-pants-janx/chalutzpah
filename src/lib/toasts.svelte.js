let nextId = 1;

export const toasts = $state({ items: [] });

export function toast(message, { kind = 'info', ms = 3800 } = {}) {
  const id = nextId++;
  toasts.items.push({ id, message, kind });
  setTimeout(() => dismiss(id), ms);
}

export function dismiss(id) {
  const i = toasts.items.findIndex((t) => t.id === id);
  if (i >= 0) toasts.items.splice(i, 1);
}

export const toastError = (err) => toast(err?.message ?? String(err), { kind: 'error', ms: 5000 });
