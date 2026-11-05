import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  jsonValueSchema,
  hostToolCallParamsSchema,
  hostToolResultContentSchema,
  hostToolResultSchema,
  hostInteractionParamsSchema,
} from "../src/methods/host.ts";

describe("Host Protocol Methods & Schemas (Task 2A / S7)", () => {
  describe("jsonValueSchema", () => {
    it("accepts valid JSON primitives", () => {
      assert.equal(jsonValueSchema.safeParse("hello").success, true);
      assert.equal(jsonValueSchema.safeParse("").success, true);
      assert.equal(jsonValueSchema.safeParse(0).success, true);
      assert.equal(jsonValueSchema.safeParse(42).success, true);
      assert.equal(jsonValueSchema.safeParse(-3.14159).success, true);
      assert.equal(jsonValueSchema.safeParse(true).success, true);
      assert.equal(jsonValueSchema.safeParse(false).success, true);
      assert.equal(jsonValueSchema.safeParse(null).success, true);
    });

    it("rejects non-finite numbers", () => {
      assert.equal(jsonValueSchema.safeParse(NaN).success, false);
      assert.equal(jsonValueSchema.safeParse(Infinity).success, false);
      assert.equal(jsonValueSchema.safeParse(-Infinity).success, false);
    });

    it("accepts valid JSON arrays and nested structures", () => {
      const valid = [1, "two", null, false, { nested: [true, { a: "b" }] }];
      assert.equal(jsonValueSchema.safeParse(valid).success, true);
      assert.equal(jsonValueSchema.safeParse([]).success, true);
      assert.equal(jsonValueSchema.safeParse({}).success, true);
    });

    it("rejects non-JSON values and objects containing them", () => {
      assert.equal(jsonValueSchema.safeParse(undefined).success, false);
      assert.equal(jsonValueSchema.safeParse(() => {}).success, false);
      assert.equal(jsonValueSchema.safeParse(Symbol("test")).success, false);
      assert.equal(jsonValueSchema.safeParse(BigInt(42)).success, false);

      assert.equal(jsonValueSchema.safeParse({ fn: () => {} }).success, false);
      assert.equal(jsonValueSchema.safeParse({ sym: Symbol() }).success, false);
      assert.equal(jsonValueSchema.safeParse({ bi: 123n }).success, false);
      assert.equal(jsonValueSchema.safeParse({ undef: undefined }).success, false);
      assert.equal(jsonValueSchema.safeParse([1, () => {}]).success, false);
      assert.equal(jsonValueSchema.safeParse([1, undefined]).success, false);
    });
  });

  describe("hostToolCallParamsSchema", () => {
    it("validates valid toolName and JSON arguments", () => {
      const res1 = hostToolCallParamsSchema.safeParse({
        toolName: "read_file",
        arguments: { path: "package.json" },
      });
      assert.equal(res1.success, true);

      const res2 = hostToolCallParamsSchema.safeParse({
        toolName: "status",
        arguments: {},
      });
      assert.equal(res2.success, true);
    });

    it("rejects invalid toolName (missing or empty)", () => {
      assert.equal(
        hostToolCallParamsSchema.safeParse({
          arguments: {},
        }).success,
        false,
      );
      assert.equal(
        hostToolCallParamsSchema.safeParse({
          toolName: "",
          arguments: {},
        }).success,
        false,
      );
    });

    it("rejects arguments with non-JSON values", () => {
      assert.equal(
        hostToolCallParamsSchema.safeParse({
          toolName: "eval",
          arguments: { callback: () => {} },
        }).success,
        false,
      );
      assert.equal(
        hostToolCallParamsSchema.safeParse({
          toolName: "eval",
          arguments: { id: 999999999999999999999999n },
        }).success,
        false,
      );
    });
  });

  describe("hostToolResultSchema", () => {
    it("accepts valid tool result with content and optional isError", () => {
      const res1 = hostToolResultSchema.safeParse({
        content: [{ type: "text", text: "file contents here" }],
      });
      assert.equal(res1.success, true);
      assert.equal(res1.data?.isError, undefined);

      const res2 = hostToolResultSchema.safeParse({
        content: [{ type: "text", text: "command failed" }],
        isError: true,
      });
      assert.equal(res2.success, true);
      assert.equal(res2.data?.isError, true);

      const res3 = hostToolResultSchema.safeParse({
        content: [{ type: "text", text: "all good" }],
        isError: false,
      });
      assert.equal(res3.success, true);
      assert.equal(res3.data?.isError, false);
    });

    it("accepts multiple text blocks or empty content array", () => {
      const res = hostToolResultSchema.safeParse({
        content: [
          { type: "text", text: "chunk 1" },
          { type: "text", text: "chunk 2" },
        ],
      });
      assert.equal(res.success, true);
      assert.equal(res.data?.content.length, 2);

      const empty = hostToolResultSchema.safeParse({ content: [] });
      assert.equal(empty.success, true);
    });

    it("rejects malformed payloads", () => {
      // Content is not array
      assert.equal(
        hostToolResultSchema.safeParse({ content: "not array" }).success,
        false,
      );
      // Missing content
      assert.equal(hostToolResultSchema.safeParse({}).success, false);
      // Unsupported content block type (only 'text' allowed)
      assert.equal(
        hostToolResultSchema.safeParse({
          content: [{ type: "image", data: "base64..." }],
        }).success,
        false,
      );
      // Missing text field in block
      assert.equal(
        hostToolResultSchema.safeParse({
          content: [{ type: "text" }],
        }).success,
        false,
      );
      // isError is not boolean
      assert.equal(
        hostToolResultSchema.safeParse({
          content: [{ type: "text", text: "err" }],
          isError: "true",
        }).success,
        false,
      );
    });
  });

  describe("hostInteractionParamsSchema", () => {
    it("accepts valid kind and optional title, message, data", () => {
      const res1 = hostInteractionParamsSchema.safeParse({
        kind: "confirm",
      });
      assert.equal(res1.success, true);

      const res2 = hostInteractionParamsSchema.safeParse({
        kind: "select",
        title: "Select an option",
        message: "Choose one of the following:",
        data: { options: ["yes", "no"] },
      });
      assert.equal(res2.success, true);
    });

    it("rejects missing or empty kind", () => {
      assert.equal(hostInteractionParamsSchema.safeParse({}).success, false);
      assert.equal(
        hostInteractionParamsSchema.safeParse({ kind: "" }).success,
        false,
      );
    });

    it("rejects non-JSON values in data payload", () => {
      assert.equal(
        hostInteractionParamsSchema.safeParse({
          kind: "custom",
          data: { fn: () => {} },
        }).success,
        false,
      );
      assert.equal(
        hostInteractionParamsSchema.safeParse({
          kind: "custom",
          data: 123456789n,
        }).success,
        false,
      );
    });
  });
});
