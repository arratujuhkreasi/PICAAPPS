import path from "node:path";

export const projectRoot = process.cwd();
export const storageRoot = path.join(projectRoot, "storage");
export const uploadRoot = path.join(storageRoot, "uploads");
export const outputRoot = path.join(storageRoot, "output");
export const tempRoot = path.join(storageRoot, "temp");
