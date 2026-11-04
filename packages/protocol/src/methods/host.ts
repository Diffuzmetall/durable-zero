import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    jsonPrimitiveSchema,
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string(),
  jsonValueSchema,
);

export const hostToolCallParamsSchema = z.object({
  toolName: z.string().min(1),
  arguments: jsonValueSchema,
});
export type HostToolCallParams = z.infer<typeof hostToolCallParamsSchema>;

export const hostToolResultContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
export type HostToolResultContent = z.infer<typeof hostToolResultContentSchema>;

export const hostToolResultSchema = z.object({
  content: z.array(hostToolResultContentSchema),
  isError: z.boolean().optional(),
});
export type HostToolResult = z.infer<typeof hostToolResultSchema>;

export const hostInteractionParamsSchema = z.object({
  kind: z.string().min(1),
  title: z.string().optional(),
  message: z.string().optional(),
  data: jsonValueSchema.optional(),
});
export type HostInteractionParams = z.infer<typeof hostInteractionParamsSchema>;
