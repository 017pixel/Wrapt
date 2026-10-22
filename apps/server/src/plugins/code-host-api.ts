import type { PluginMethod, PluginRequest, PluginSchema } from "@wrapt/plugin-sdk";
import { pluginRuntimeNameSchema } from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";
import { z } from "zod";

export interface PluginHostOperationInfo {
  name: string;
  description: string;
  mutates: boolean;
  hookable: boolean;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

interface HostOperation extends PluginHostOperationInfo {
  input?: PluginSchema;
  output?: PluginSchema;
  handler(input: unknown, request: PluginRequest): unknown | Promise<unknown>;
}

/** Öffentliche Fachoperationen; Auth-, Bootstrap- und Recovery-Innereien werden nicht registriert. */
export class PluginHostApi {
  private readonly operations = new Map<string, HostOperation>();

  register<I, O>(name: string, operation: PluginMethod<I, O> & Omit<PluginHostOperationInfo, "name">): void {
    pluginRuntimeNameSchema.parse(name);
    if (this.operations.has(name)) throw new AppError(409, "contribution-collision", `Die Host-Operation ${name} ist bereits registriert.`);
    this.operations.set(name, { ...operation, name });
  }

  describe(): PluginHostOperationInfo[] {
    const schema = (value: PluginSchema | undefined, io: "input" | "output"): unknown => {
      if (!(value instanceof z.ZodType)) return undefined;
      return z.toJSONSchema(value, { io, unrepresentable: "any" });
    };
    return [...this.operations.values()].map(({ name, description, mutates, hookable, input, output }) => ({
      name, description, mutates, hookable, inputSchema: schema(input, "input"), outputSchema: schema(output, "output"),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  info(name: string): PluginHostOperationInfo {
    const operation = this.operations.get(name);
    if (!operation) throw new AppError(404, "not-found", `Die öffentliche Host-Operation ${name} existiert nicht.`);
    return { name: operation.name, description: operation.description, mutates: operation.mutates, hookable: operation.hookable };
  }

  validateResult(name: string, value: unknown): unknown {
    const operation = this.operations.get(name);
    if (!operation) throw new AppError(404, "not-found", "Die Host-Operation existiert nicht.");
    return operation.output ? operation.output.parse(value) : value;
  }

  async call(name: string, input: unknown, request: PluginRequest): Promise<unknown> {
    const operation = this.operations.get(name);
    if (!operation) throw new AppError(404, "not-found", `Die öffentliche Host-Operation ${name} existiert nicht.`);
    request.signal.throwIfAborted();
    const parsed = operation.input ? operation.input.parse(input) : input;
    const output = await operation.handler(parsed, request);
    return operation.output ? operation.output.parse(output) : output;
  }
}
