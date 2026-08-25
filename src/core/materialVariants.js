function getObjectMaterials(object) {
  if (!object.isMesh || !object.material) {
    return [];
  }
  return Array.isArray(object.material) ? object.material : [object.material];
}

export function collectMaterials(root) {
  const materials = new Set();
  root.traverse((object) => {
    getObjectMaterials(object)
      .filter(Boolean)
      .forEach((material) => materials.add(material));
  });
  return [...materials];
}

// Keep geometry and textures shared while giving one scene instance independent materials.
export function cloneObjectMaterials(root) {
  const clones = new Map();

  root.traverse((object) => {
    const materials = getObjectMaterials(object);
    if (materials.length === 0) {
      return;
    }

    const cloned = materials.map((material) => {
      if (!material) {
        return material;
      }
      if (!clones.has(material)) {
        clones.set(material, material.clone());
      }
      return clones.get(material);
    });
    object.material = Array.isArray(object.material) ? cloned : cloned[0];
  });

  return [...clones.values()];
}

/**
 * Applies a reusable color variant to matching materials under an Object3D root.
 * Call cloneObjectMaterials(root) first when sibling instances must keep their colors.
 */
export function applyMaterialColor(
  root,
  {
    match = () => true,
    color,
    emissive,
    rename,
    userData,
  } = {},
) {
  const changed = [];

  collectMaterials(root).forEach((material) => {
    if (!match(material)) {
      return;
    }
    if (color !== undefined && material.color?.isColor) {
      material.color.set(color);
    }
    if (emissive !== undefined && material.emissive?.isColor) {
      material.emissive.set(emissive);
    }
    if (rename) {
      material.name = rename(material.name, material);
    }
    if (userData) {
      Object.assign(material.userData, userData);
    }
    material.needsUpdate = true;
    changed.push(material);
  });

  return changed;
}
