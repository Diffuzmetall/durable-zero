export class JsonRpcMethodNotFoundError extends Error {
  public readonly code = -32601 as const;
  public readonly method?: string;

  constructor(method?: string) {
    super(method ? `Method not found: ${method}` : "Method not found");
    this.name = "JsonRpcMethodNotFoundError";
    this.method = method;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class JsonRpcInvalidParamsError extends Error {
  public readonly code = -32602 as const;
  public readonly data?: unknown;

  constructor(message = "Invalid params", data?: unknown) {
    super(message);
    this.name = "JsonRpcInvalidParamsError";
    this.data = data;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

