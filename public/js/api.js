/* API adapter for the real server: fetch for requests, Socket.IO for live updates.
   The demo build swaps this file for an in-browser mock with the same interface. */
(function () {
  let sessionToken = null;
  async function call(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['X-Session'] = sessionToken;
    let res;
    try {
      res = await fetch('/api' + path, { method, headers, credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw Object.assign(new Error('No connection. Check your internet and try again.'), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status });
    return data;
  }
  window.API = {
    mode: 'server',
    setSessionToken(t) { sessionToken = t; },
    get: p => call('GET', p),
    post: (p, b) => call('POST', p, b || {}),
    patch: (p, b) => call('PATCH', p, b || {}),
    put: (p, b) => call('PUT', p, b || {}),
    del: p => call('DELETE', p),
    // Live updates. Returns { on(event, fn), close() }.
    // Live updates come from automatic refresh (Vercel has no permanent connections).
    connect({ sessionToken: tok } = {}) {
      if (typeof io !== 'function') return { on() {}, close() {}, onStatus() {} };
      const socket = io({ transports: ['websocket', 'polling'] });
      const statusFns = [];
      socket.on('connect', () => { if (tok) socket.emit('customer:join', tok); statusFns.forEach(f => f(true)); });
      socket.on('disconnect', () => statusFns.forEach(f => f(false)));
      return {
        on: (ev, fn) => socket.on(ev, fn),
        onStatus: fn => statusFns.push(fn),
        close: () => socket.close(),
      };
    },
  };
})();
