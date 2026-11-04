import { StdioJsonRpcServer, JsonRpcMethodNotFoundError } from "@durable-zero/protocol";

let counter = 0;
const logs = [];

const server = new StdioJsonRpcServer({
  handler: async (method, params) => {
    switch (method) {
      case "echo":
        return params;
      case "get_state":
        return { counter, logsCount: logs.length };
      case "increment":
        counter += (params?.amount ?? 1);
        return counter;
      case "notify_increment":
        counter += (params?.amount ?? 1);
        return; // void notification
      case "log":
        logs.push(params);
        return;
      case "falsy_zero":
        return 0;
      case "falsy_false":
        return false;
      case "falsy_empty_str":
        return "";
      case "falsy_null":
        return null;
      case "void_return":
        return; // undefined -> null
      case "reverse_call": {
        return await server.request(params.method, params.params, params.timeoutMs);
      }
      case "throw_generic":
        throw new Error(params?.message ?? "generic handler failure");
      case "throw_generic_named_nf": {
        const err = new Error(params?.message ?? "backend fault");
        err.name = "JsonRpcMethodNotFoundError";
        throw err;
      }
      case "throw_not_found":
        throw new JsonRpcMethodNotFoundError(params?.methodName ?? "unregistered_method");
      case "notify_throw_generic":
        throw new Error("notification generic failure");
      case "notify_throw_not_found":
        throw new JsonRpcMethodNotFoundError("notification_not_found");
      case "shutdown":
        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 10);
        return "shutting_down";
      default:
        throw new JsonRpcMethodNotFoundError(method);
    }
  }
});

server.start();

process.on("SIGTERM", () => {
  server.close();
  process.exit(0);
});
process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
