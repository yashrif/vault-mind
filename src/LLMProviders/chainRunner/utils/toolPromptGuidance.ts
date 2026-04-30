import type { ToolMetadata } from "@/tools/ToolRegistry";

export interface BuildToolPromptGuidanceOptions {
  toolMetadata: ToolMetadata[];
  availableToolNames: string[];
  prefixCustomInstructionsWithDisplayName?: boolean;
}

/**
 * Build instructional text for the exact tools available to this run.
 */
export function buildToolPromptGuidance(options: BuildToolPromptGuidanceOptions): string {
  const availableToolNames = new Set(options.availableToolNames);
  const instructions: string[] = [];
  const availableMetadata = options.toolMetadata.filter((metadata) =>
    availableToolNames.has(metadata.id)
  );

  for (const metadata of availableMetadata) {
    if (metadata.customPromptInstructions) {
      instructions.push(
        options.prefixCustomInstructionsWithDisplayName
          ? `For ${metadata.displayName}: ${metadata.customPromptInstructions}`
          : metadata.customPromptInstructions
      );
    }

    for (const conditionalInstruction of metadata.conditionalPromptInstructions ?? []) {
      const shouldInclude = conditionalInstruction.requiredToolIds.every((toolId) =>
        availableToolNames.has(toolId)
      );

      if (shouldInclude) {
        instructions.push(conditionalInstruction.content);
      }
    }
  }

  const cortexCommandInstructions = buildCortexCommandInstructions(availableMetadata);
  if (cortexCommandInstructions) {
    instructions.push(cortexCommandInstructions);
  }

  return instructions.join("\n\n");
}

/**
 * Build instructional text that maps Cortex command aliases to available tool names.
 */
function buildCortexCommandInstructions(toolMetadata: ToolMetadata[]): string | null {
  const aliasLines: string[] = [];

  for (const metadata of toolMetadata) {
    for (const command of metadata.CortexCommands ?? []) {
      aliasLines.push(`- ${command}: call the tool named ${metadata.id}`);
    }
  }

  if (aliasLines.length === 0) {
    return null;
  }

  return [
    "When the user explicitly includes a Cortex command alias (e.g., @vault) in their message, treat it as a direct request to call the mapped tool before proceeding.",
    "Honor these aliases exactly (case-insensitive):",
    ...aliasLines,
    "If the referenced tool is unavailable, explain that the command cannot be fulfilled instead of ignoring it.",
  ].join("\n");
}
