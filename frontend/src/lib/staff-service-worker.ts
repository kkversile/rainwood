export function staffServiceWorkerConfig(basePath = '') {
  return { url: `${basePath}/sw.js`, scope: `${basePath}/staff/` };
}
