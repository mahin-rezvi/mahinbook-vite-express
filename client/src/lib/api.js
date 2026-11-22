export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/**
 * api('/posts/feed')
 * api('/posts', { method: 'POST', form: { content, files: [File, File] } })
 * api('/settings', { method: 'PATCH', body: { theme: 'dark' } })
 */
export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, credentials: 'include', headers: {} };
  if (form) {
    opts.body = form instanceof FormData ? form : toFormData(form);
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data;
}

function toFormData(obj) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((item) => fd.append(k, item));
    else fd.append(k, v);
  }
  return fd;
}

export const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
