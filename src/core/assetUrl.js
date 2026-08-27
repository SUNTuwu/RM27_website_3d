export function assetUrl(relativePath) {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}assets/${relativePath.replace(/^\/+/, "")}`;
}
