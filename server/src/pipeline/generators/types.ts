export interface GeneratorOptions {
  seed: string;
  width: number;
  height: number;
}

export type Generator = (options: GeneratorOptions) => Promise<Buffer>;
