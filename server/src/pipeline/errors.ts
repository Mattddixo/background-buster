export class PipelineError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode = 400, code = 'PIPELINE_ERROR') {
    super(message);
    this.name = 'PipelineError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class UpscaleNotAllowedError extends PipelineError {
  constructor(source: { width: number; height: number }, target: { width: number; height: number }) {
    super(
      `Target ${target.width}x${target.height} is larger than the source (${source.width}x${source.height}). Pass allowUpscale to proceed anyway.`,
      422,
      'UPSCALE_NOT_ALLOWED',
    );
  }
}

export class UnsupportedMediaError extends PipelineError {
  constructor(format: string) {
    super(`Unsupported file type: ${format}`, 415, 'UNSUPPORTED_MEDIA');
  }
}
