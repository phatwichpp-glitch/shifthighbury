// @ts-nocheck
// Session/local storage wrappers for auth tokens and DB ID

export const tokenStore = {
  get: () => sessionStorage.getItem('zw_token') || '',
  set: (t) => sessionStorage.setItem('zw_token', t),
  clear: () => sessionStorage.removeItem('zw_token'),
};

export const userStore = {
  get: () => { try { return JSON.parse(sessionStorage.getItem('zw_user') || 'null'); } catch { return null; } },
  set: (u) => sessionStorage.setItem('zw_user', JSON.stringify(u)),
  clear: () => sessionStorage.removeItem('zw_user'),
};

export const dbStore = {
  get: () => localStorage.getItem('zw_db_id') || '',
  set: (id) => localStorage.setItem('zw_db_id', id),
  clear: () => localStorage.removeItem('zw_db_id'),
};
