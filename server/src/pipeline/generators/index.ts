import type { Generator } from './types.js';
import { generateSolid } from './solid.js';
import { generateGradient } from './gradient.js';
import { generateMesh } from './mesh.js';
import { generatePlasma } from './plasma.js';
import { generateLowPoly } from './lowpoly.js';

export const generators: Record<string, Generator> = {
  solid: generateSolid,
  gradient: generateGradient,
  mesh: generateMesh,
  plasma: generatePlasma,
  lowpoly: generateLowPoly,
};
