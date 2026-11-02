import { z } from "zod";
export interface CommandResponder {
    success: (id: string | undefined, command: string, data?: unknown) => void;
    error: (id: string | undefined, command: string, message: string) => void;
}
export declare const runnerCommandSchema: z.ZodObject<{
    type: z.ZodEnum<["prompt", "steer", "abort", "abort_task", "compact", "set_subagent_policy", "get_available_models", "set_model", "set_thinking_level", "get_state", "get_session_stats", "register_binding", "get_all_bindings"]>;
    id: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodLiteral<"image">;
        data: z.ZodString;
        mimeType: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "image";
        data: string;
        mimeType: string;
    }, {
        type: "image";
        data: string;
        mimeType: string;
    }>, "many">>;
    streamingBehavior: z.ZodOptional<z.ZodEnum<["steer", "followUp"]>>;
    provider: z.ZodOptional<z.ZodString>;
    modelId: z.ZodOptional<z.ZodString>;
    instructions: z.ZodOptional<z.ZodString>;
    level: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    threadId: z.ZodOptional<z.ZodString>;
    parentThreadId: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
    policyRecord: z.ZodOptional<z.ZodUnknown>;
    taskId: z.ZodOptional<z.ZodNumber>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    type: z.ZodEnum<["prompt", "steer", "abort", "abort_task", "compact", "set_subagent_policy", "get_available_models", "set_model", "set_thinking_level", "get_state", "get_session_stats", "register_binding", "get_all_bindings"]>;
    id: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodLiteral<"image">;
        data: z.ZodString;
        mimeType: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "image";
        data: string;
        mimeType: string;
    }, {
        type: "image";
        data: string;
        mimeType: string;
    }>, "many">>;
    streamingBehavior: z.ZodOptional<z.ZodEnum<["steer", "followUp"]>>;
    provider: z.ZodOptional<z.ZodString>;
    modelId: z.ZodOptional<z.ZodString>;
    instructions: z.ZodOptional<z.ZodString>;
    level: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    threadId: z.ZodOptional<z.ZodString>;
    parentThreadId: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
    policyRecord: z.ZodOptional<z.ZodUnknown>;
    taskId: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    type: z.ZodEnum<["prompt", "steer", "abort", "abort_task", "compact", "set_subagent_policy", "get_available_models", "set_model", "set_thinking_level", "get_state", "get_session_stats", "register_binding", "get_all_bindings"]>;
    id: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodLiteral<"image">;
        data: z.ZodString;
        mimeType: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "image";
        data: string;
        mimeType: string;
    }, {
        type: "image";
        data: string;
        mimeType: string;
    }>, "many">>;
    streamingBehavior: z.ZodOptional<z.ZodEnum<["steer", "followUp"]>>;
    provider: z.ZodOptional<z.ZodString>;
    modelId: z.ZodOptional<z.ZodString>;
    instructions: z.ZodOptional<z.ZodString>;
    level: z.ZodOptional<z.ZodEnum<["off", "minimal", "low", "medium", "high", "xhigh"]>>;
    conversationId: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    threadId: z.ZodOptional<z.ZodString>;
    parentThreadId: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
    policyRecord: z.ZodOptional<z.ZodUnknown>;
    taskId: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>;
export type RunnerCommandPayload = z.infer<typeof runnerCommandSchema>;
export declare const knownCommandTypes: ReadonlySet<string>;
export declare const runnerRequestHeaderSchema: z.ZodObject<{
    type: z.ZodString;
    id: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    type: z.ZodString;
    id: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    type: z.ZodString;
    id: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare function parseRunnerCommand(line: string): RunnerCommandPayload;
