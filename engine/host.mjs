// The background local host (A10, 0.13.0). Stub: the signatures WP4/WP5 code against; the body lands next.
//   start({editor, port, open}) → {pid, port, url}
//   stop()                      → {stopped, pids}
//   status()                    → {running, pid, port, tabs}
export async function start({ editor, port = 4317, open = true } = {}) { throw new Error('host.start: not built yet'); }
export async function stop() { return { stopped: false, pids: [] }; }
export function status() { return { running: false, pid: null, port: null, tabs: 0 }; }
