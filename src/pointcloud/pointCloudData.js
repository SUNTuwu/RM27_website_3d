const HEADER_BYTES = 32;
const MAGIC = [0x45, 0x50, 0x43, 0x31]; // EPC1

export function parsePointCloudData(buffer, url) {
  if (buffer.byteLength < HEADER_BYTES) {
    throw new Error(`Point-cloud data is truncated: ${url}`);
  }

  const view = new DataView(buffer);
  if (MAGIC.some((value, index) => view.getUint8(index) !== value)) {
    throw new Error(`Unsupported point-cloud data format: ${url}`);
  }

  const count = view.getUint32(4, true);
  const expectedBytes = HEADER_BYTES + count * 3 * Float32Array.BYTES_PER_ELEMENT;
  if (count === 0 || buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Invalid point-cloud data length: expected ${expectedBytes}, received ${buffer.byteLength}`,
    );
  }

  const min = [
    view.getFloat32(8, true),
    view.getFloat32(12, true),
    view.getFloat32(16, true),
  ];
  const max = [
    view.getFloat32(20, true),
    view.getFloat32(24, true),
    view.getFloat32(28, true),
  ];
  const validBounds = [...min, ...max].every(Number.isFinite) &&
    min.every((value, index) => value <= max[index]);
  if (!validBounds) {
    throw new Error(`Invalid point-cloud bounds: ${url}`);
  }

  return {
    count,
    min,
    max,
    positions: new Float32Array(buffer, HEADER_BYTES, count * 3),
  };
}
async function readResponse(response, onProgress) {
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    onProgress?.({ ratio: 1, loaded: buffer.byteLength, total, url: response.url });
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({
      ratio: total > 0 ? Math.min(loaded / total, 0.98) : 0,
      loaded,
      total,
      url: response.url,
    });
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress?.({ ratio: 1, loaded, total: total || loaded, url: response.url });
  return bytes.buffer;
}

export async function fetchPointCloudBuffer(url, { onProgress } = {}) {
  onProgress?.({ ratio: 0, loaded: 0, total: 0, url });
  let response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(`Unable to fetch point-cloud data from ${url}`, { cause });
  }
  if (!response.ok) {
    throw new Error(
      `Unable to fetch point-cloud data from ${url}: HTTP ${response.status}`,
    );
  }

  return readResponse(response, onProgress);
}

export async function loadPointCloudData(url, { onProgress } = {}) {
  return parsePointCloudData(
    await fetchPointCloudBuffer(url, { onProgress }),
    url,
  );
}
