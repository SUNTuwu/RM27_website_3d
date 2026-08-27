import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Matrix4, Quaternion, Vector3 } from "three";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const defaults = {
  source: "assets/models/arena/arena_half_blue.gltf",
  output: "assets/pointcloud/arena_points.bin",
  count: 50_000,
  rotationAxis: "y",
};
const componentReaders = {
  5120: { bytes: 1, read: (view, offset) => view.getInt8(offset) },
  5121: { bytes: 1, read: (view, offset) => view.getUint8(offset) },
  5122: { bytes: 2, read: (view, offset) => view.getInt16(offset, true) },
  5123: { bytes: 2, read: (view, offset) => view.getUint16(offset, true) },
  5125: { bytes: 4, read: (view, offset) => view.getUint32(offset, true) },
  5126: { bytes: 4, read: (view, offset) => view.getFloat32(offset, true) },
};
const typeSizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function parseArguments(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      name === "--source" ||
      name === "--output" ||
      name === "--count" ||
      name === "--rotation-axis"
    ) {
      if (!value) {
        throw new Error(`Missing value for ${name}`);
      }
      const key = name === "--rotation-axis" ? "rotationAxis" : name.slice(2);
      options[key] = name === "--count" ? Number(value) : value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${name}`);
    }
  }
  if (!Number.isInteger(options.count) || options.count <= 0) {
    throw new Error("--count must be a positive integer");
  }
  if (!["x", "y", "z"].includes(options.rotationAxis)) {
    throw new Error("--rotation-axis must be x, y, or z");
  }
  return options;
}

async function loadBuffers(gltf, sourceDirectory) {
  return Promise.all(
    (gltf.buffers ?? []).map(async (buffer, index) => {
      if (!buffer.uri) {
        throw new Error(`Buffer ${index} has no external URI`);
      }
      if (buffer.uri.startsWith("data:")) {
        const comma = buffer.uri.indexOf(",");
        return Buffer.from(buffer.uri.slice(comma + 1), "base64");
      }
      return readFile(path.resolve(sourceDirectory, decodeURIComponent(buffer.uri)));
    }),
  );
}

function createAccessorReader(gltf, buffers, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor || accessor.bufferView === undefined || accessor.sparse) {
    throw new Error(`Accessor ${accessorIndex} is missing, sparse, or has no bufferView`);
  }
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  const source = buffers[bufferView?.buffer];
  const component = componentReaders[accessor.componentType];
  const itemSize = typeSizes[accessor.type];
  if (!bufferView || !source || !component || !itemSize) {
    throw new Error(`Accessor ${accessorIndex} uses an unsupported layout`);
  }
  const packedStride = component.bytes * itemSize;
  const stride = bufferView.byteStride ?? packedStride;
  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);

  return {
    count: accessor.count,
    componentType: accessor.componentType,
    itemSize,
    get(itemIndex, componentIndex = 0) {
      if (itemIndex < 0 || itemIndex >= accessor.count) {
        throw new Error(`Accessor ${accessorIndex} index ${itemIndex} is out of range`);
      }
      return component.read(
        view,
        baseOffset + itemIndex * stride + componentIndex * component.bytes,
      );
    },
  };
}

function localMatrix(node) {
  if (node.matrix) {
    return new Matrix4().fromArray(node.matrix);
  }
  const translation = new Vector3().fromArray(node.translation ?? [0, 0, 0]);
  const rotation = new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]);
  const scale = new Vector3().fromArray(node.scale ?? [1, 1, 1]);
  return new Matrix4().compose(translation, rotation, scale);
}

function collectPrimitiveInstances(gltf) {
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  if (!scene) {
    throw new Error("glTF does not contain an active scene");
  }
  const instances = [];

  function visit(nodeIndex, parentMatrix) {
    const node = gltf.nodes?.[nodeIndex];
    if (!node) {
      throw new Error(`Scene references missing node ${nodeIndex}`);
    }
    const worldMatrix = new Matrix4().multiplyMatrices(
      parentMatrix,
      localMatrix(node),
    );
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes?.[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        if ((primitive.mode ?? 4) !== 4) {
          throw new Error("Only TRIANGLES primitives can generate point-cloud data");
        }
        if (primitive.extensions?.KHR_draco_mesh_compression) {
          throw new Error(
            "Generate the point-cloud artifact before applying Draco compression",
          );
        }
        instances.push({ primitive, worldMatrix: worldMatrix.clone() });
      }
    }
    for (const child of node.children ?? []) {
      visit(child, worldMatrix);
    }
  }

  for (const rootNode of scene.nodes ?? []) {
    visit(rootNode, new Matrix4());
  }
  return instances;
}

function createSymmetricInstances(instances, rotationAxis) {
  const axes = {
    x: new Vector3(1, 0, 0),
    y: new Vector3(0, 1, 0),
    z: new Vector3(0, 0, 1),
  };
  const rotation = new Matrix4().makeRotationAxis(
    axes[rotationAxis],
    Math.PI,
  );
  const rotated = instances.map(({ primitive, worldMatrix }) => ({
    primitive,
    worldMatrix: new Matrix4().multiplyMatrices(rotation, worldMatrix),
  }));
  return [...instances, ...rotated];
}

function buildTriangleDistribution(gltf, buffers, instances) {
  const maximumTriangles = instances.reduce((total, { primitive }) => {
    const count = primitive.indices === undefined
      ? gltf.accessors?.[primitive.attributes.POSITION]?.count ?? 0
      : gltf.accessors?.[primitive.indices]?.count ?? 0;
    return total + Math.floor(count / 3);
  }, 0);
  const triangles = new Float32Array(maximumTriangles * 9);
  const cumulativeArea = new Float64Array(maximumTriangles);
  const boundsMin = new Vector3(Infinity, Infinity, Infinity);
  const boundsMax = new Vector3(-Infinity, -Infinity, -Infinity);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const edgeA = new Vector3();
  const edgeB = new Vector3();
  let validTriangles = 0;
  let totalArea = 0;

  for (const { primitive, worldMatrix } of instances) {
    const positions = createAccessorReader(
      gltf,
      buffers,
      primitive.attributes.POSITION,
    );
    if (positions.componentType !== 5126 || positions.itemSize !== 3) {
      throw new Error("POSITION accessors must use Float32 VEC3 data");
    }
    const indices = primitive.indices === undefined
      ? null
      : createAccessorReader(gltf, buffers, primitive.indices);
    const indexCount = indices?.count ?? positions.count;
    if (indexCount % 3 !== 0) {
      throw new Error("Triangle index count must be divisible by three");
    }

    for (let offset = 0; offset < indexCount; offset += 3) {
      const ai = indices ? indices.get(offset) : offset;
      const bi = indices ? indices.get(offset + 1) : offset + 1;
      const ci = indices ? indices.get(offset + 2) : offset + 2;
      a.set(positions.get(ai, 0), positions.get(ai, 1), positions.get(ai, 2));
      b.set(positions.get(bi, 0), positions.get(bi, 1), positions.get(bi, 2));
      c.set(positions.get(ci, 0), positions.get(ci, 1), positions.get(ci, 2));
      a.applyMatrix4(worldMatrix);
      b.applyMatrix4(worldMatrix);
      c.applyMatrix4(worldMatrix);
      boundsMin.min(a).min(b).min(c);
      boundsMax.max(a).max(b).max(c);
      const area = edgeA.subVectors(b, a)
        .cross(edgeB.subVectors(c, a))
        .length() * 0.5;
      if (area <= 1e-12) {
        continue;
      }

      const target = validTriangles * 9;
      triangles.set(
        [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z],
        target,
      );
      totalArea += area;
      cumulativeArea[validTriangles] = totalArea;
      validTriangles += 1;
    }
  }

  if (validTriangles === 0 || !Number.isFinite(totalArea)) {
    throw new Error("No non-degenerate triangles were found in the active scene");
  }
  return {
    triangles: triangles.subarray(0, validTriangles * 9),
    cumulativeArea: cumulativeArea.subarray(0, validTriangles),
    totalArea,
    boundsMin,
    boundsMax,
  };
}

function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function lowerBound(values, target) {
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function samplePoints(distribution, count) {
  const random = createRandom(0x524d3236);
  const points = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const triangle = lowerBound(
      distribution.cumulativeArea,
      random() * distribution.totalArea,
    );
    const offset = triangle * 9;
    const root = Math.sqrt(random());
    const third = random();
    const wa = 1 - root;
    const wb = root * (1 - third);
    const wc = root * third;
    points[index * 3] =
      distribution.triangles[offset] * wa +
      distribution.triangles[offset + 3] * wb +
      distribution.triangles[offset + 6] * wc;
    points[index * 3 + 1] =
      distribution.triangles[offset + 1] * wa +
      distribution.triangles[offset + 4] * wb +
      distribution.triangles[offset + 7] * wc;
    points[index * 3 + 2] =
      distribution.triangles[offset + 2] * wa +
      distribution.triangles[offset + 5] * wb +
      distribution.triangles[offset + 8] * wc;
  }
  return points;
}

function encodePointCloud(points, boundsMin, boundsMax) {
  const headerBytes = 32;
  const output = Buffer.allocUnsafe(headerBytes + points.byteLength);
  output.write("EPC1", 0, 4, "ascii");
  output.writeUInt32LE(points.length / 3, 4);
  [boundsMin.x, boundsMin.y, boundsMin.z].forEach((value, index) => {
    output.writeFloatLE(value, 8 + index * 4);
  });
  [boundsMax.x, boundsMax.y, boundsMax.z].forEach((value, index) => {
    output.writeFloatLE(value, 20 + index * 4);
  });
  for (let index = 0; index < points.length; index += 1) {
    output.writeFloatLE(points[index], headerBytes + index * 4);
  }
  return output;
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  const sourcePath = path.resolve(repositoryRoot, options.source);
  const outputPath = path.resolve(repositoryRoot, options.output);
  const gltf = JSON.parse(await readFile(sourcePath, "utf8"));
  const buffers = await loadBuffers(gltf, path.dirname(sourcePath));
  const instances = createSymmetricInstances(
    collectPrimitiveInstances(gltf),
    options.rotationAxis,
  );
  const distribution = buildTriangleDistribution(gltf, buffers, instances);
  const points = samplePoints(distribution, options.count);
  const encoded = encodePointCloud(
    points,
    distribution.boundsMin,
    distribution.boundsMax,
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, encoded);
  console.log(
    `Generated ${path.relative(repositoryRoot, outputPath)}: ` +
      `${options.count.toLocaleString("en-US")} points, ` +
      `${(encoded.byteLength / 1024).toFixed(1)} KiB, ` +
      `180deg ${options.rotationAxis.toUpperCase()} symmetry`,
  );
}

run().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
