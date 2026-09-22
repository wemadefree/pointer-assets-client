export type PointerAssetsErrorCode =
  | "AUTHENTICATION"
  | "API"
  | "UPLOAD"
  | "DOWNLOAD"
  | "NETWORK"
  | "INVALID_RESPONSE"
  | "INVALID_ARGUMENT";

export class PointerAssetsError extends Error {
  readonly code: PointerAssetsErrorCode;

  constructor(
    message: string,
    code: PointerAssetsErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PointerAssetsError";
    this.code = code;
  }
}

export class PointerAssetsAuthenticationError extends PointerAssetsError {
  constructor(message = "No access token is available") {
    super(message, "AUTHENTICATION");
    this.name = "PointerAssetsAuthenticationError";
  }
}

export class PointerAssetsApiError extends PointerAssetsError {
  readonly statusCode: number;
  readonly backendError?: string;
  readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    options?: {
      backendError?: string;
      requestId?: string;
    },
  ) {
    super(message, "API");
    this.name = "PointerAssetsApiError";
    this.statusCode = statusCode;
    if (options?.backendError !== undefined) {
      this.backendError = options.backendError;
    }
    if (options?.requestId !== undefined) {
      this.requestId = options.requestId;
    }
  }
}

export class PointerAssetsUploadError extends PointerAssetsError {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message, "UPLOAD");
    this.name = "PointerAssetsUploadError";
    this.statusCode = statusCode;
  }
}

export class PointerAssetsDownloadError extends PointerAssetsError {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message, "DOWNLOAD");
    this.name = "PointerAssetsDownloadError";
    this.statusCode = statusCode;
  }
}

export class PointerAssetsNetworkError extends PointerAssetsError {
  readonly operation: string;

  constructor(operation: string, cause: unknown) {
    super(`Network request failed during ${operation}`, "NETWORK", { cause });
    this.name = "PointerAssetsNetworkError";
    this.operation = operation;
  }
}

export class PointerAssetsInvalidResponseError extends PointerAssetsError {
  readonly operation: string;

  constructor(operation: string, message = "Response did not match the expected contract") {
    super(`${message} (${operation})`, "INVALID_RESPONSE");
    this.name = "PointerAssetsInvalidResponseError";
    this.operation = operation;
  }
}

export class PointerAssetsInvalidArgumentError extends PointerAssetsError {
  constructor(message: string) {
    super(message, "INVALID_ARGUMENT");
    this.name = "PointerAssetsInvalidArgumentError";
  }
}
