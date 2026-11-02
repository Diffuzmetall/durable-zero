import { z } from "zod";
export declare const runnerResponseSchema: z.ZodDiscriminatedUnion<"success", [z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"response">;
    command: z.ZodString;
} & {
    success: z.ZodLiteral<true>;
    data: z.ZodOptional<z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"response">;
    command: z.ZodString;
} & {
    success: z.ZodLiteral<true>;
    data: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"response">;
    command: z.ZodString;
} & {
    success: z.ZodLiteral<true>;
    data: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"response">;
    command: z.ZodString;
} & {
    success: z.ZodLiteral<false>;
    error: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"response">;
    command: z.ZodString;
} & {
    success: z.ZodLiteral<false>;
    error: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"response">;
    command: z.ZodString;
} & {
    success: z.ZodLiteral<false>;
    error: z.ZodString;
}, z.ZodTypeAny, "passthrough">>]>;
export type RunnerResponse = z.infer<typeof runnerResponseSchema>;
