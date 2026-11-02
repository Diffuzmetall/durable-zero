import { z } from "zod";
export declare const runnerChannelSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    kind: z.ZodLiteral<"ready">;
    ready: z.ZodOptional<z.ZodBoolean>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    kind: z.ZodLiteral<"ready">;
    ready: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    kind: z.ZodLiteral<"ready">;
    ready: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
    kind: z.ZodLiteral<"model-scope">;
    scopedModelIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    defaultModelId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    kind: z.ZodLiteral<"model-scope">;
    scopedModelIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    defaultModelId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    kind: z.ZodLiteral<"model-scope">;
    scopedModelIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    defaultModelId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
    kind: z.ZodLiteral<"reply">;
    id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    result: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    kind: z.ZodLiteral<"reply">;
    id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    result: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    kind: z.ZodLiteral<"reply">;
    id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    result: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>]>;
export declare const runnerBridgeRequestSchema: z.ZodObject<{
    kind: z.ZodLiteral<"request">;
    id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    method: z.ZodString;
    params: z.ZodOptional<z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    kind: z.ZodLiteral<"request">;
    id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    method: z.ZodString;
    params: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    kind: z.ZodLiteral<"request">;
    id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    method: z.ZodString;
    params: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>;
export type RunnerChannelFrame = z.infer<typeof runnerChannelSchema>;
export declare const knownChannelKinds: ReadonlySet<string>;
