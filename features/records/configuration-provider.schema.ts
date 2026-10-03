import { z } from "zod";

import type { CalculationExpression } from "./record-model.schema";

import { RecordScalarSchema } from "./record-model.schema";
import { ConfigurationReferenceSchema, configurationSchemaWithExpression } from "./configuration.schema";

const NodeIdSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
export const CalculationProgramSchema = z
  .object({
    root: NodeIdSchema,
    nodes: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              id: NodeIdSchema,
              kind: z.literal("literal"),
              value: RecordScalarSchema.nullable(),
            })
            .strict(),
          z
            .object({
              id: NodeIdSchema,
              kind: z.literal("field"),
              fieldId: ConfigurationReferenceSchema,
            })
            .strict(),
          z
            .object({
              id: NodeIdSchema,
              kind: z.literal("optionAttribute"),
              fieldId: ConfigurationReferenceSchema,
              attribute: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
            })
            .strict(),
          z
            .object({
              id: NodeIdSchema,
              kind: z.literal("related"),
              relationId: ConfigurationReferenceSchema,
              direction: z.enum(["incoming", "outgoing"]),
              expressionNode: NodeIdSchema,
              reducer: z.enum(["one", "sum", "count", "average", "min", "max"]),
            })
            .strict(),
          z
            .object({
              id: NodeIdSchema,
              kind: z.literal("operation"),
              operator: z.enum([
                "add",
                "subtract",
                "multiply",
                "divide",
                "equal",
                "lessThan",
                "greaterThan",
                "and",
                "or",
                "not",
                "if",
                "coalesce",
                "concat",
                "lower",
                "upper",
                "trim",
                "daysBetween",
              ]),
              argumentNodes: z.array(NodeIdSchema).min(1).max(32),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(256),
  })
  .strict();

export const ProviderConfigurationChangeSchema = configurationSchemaWithExpression(CalculationProgramSchema);
export type ProviderConfigurationChange = z.infer<typeof ProviderConfigurationChangeSchema>;

export function decodeCalculationProgram(
  program: z.infer<typeof CalculationProgramSchema>,
): CalculationExpression | null {
  const nodes = new Map<string, CalculationExpression>();
  for (const node of program.nodes) {
    if (nodes.has(node.id)) return null;
    if (node.kind === "related") {
      const expression = nodes.get(node.expressionNode);
      if (!expression) return null;
      nodes.set(node.id, {
        kind: "related",
        relationId: node.relationId,
        direction: node.direction,
        reducer: node.reducer,
        expression,
      });
    } else if (node.kind === "operation") {
      const args: CalculationExpression[] = [];
      for (const id of node.argumentNodes) {
        const expression = nodes.get(id);
        if (!expression) return null;
        args.push(expression);
      }
      nodes.set(node.id, {
        kind: "operation",
        operator: node.operator,
        arguments: args,
      });
    } else {
      const { id, ...expression } = node;
      nodes.set(id, expression);
    }
  }
  return nodes.get(program.root) ?? null;
}
