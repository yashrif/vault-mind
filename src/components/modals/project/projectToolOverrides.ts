import type { ProjectConfig, ToolOverrideValue } from "@/aiParams";

/**
 * Returns a project copy with one agent tool override updated.
 */
export function withProjectToolOverride(
  project: ProjectConfig,
  toolId: string,
  value: ToolOverrideValue
): ProjectConfig {
  return {
    ...project,
    toolOverrides: {
      ...project.toolOverrides,
      agent: {
        ...project.toolOverrides?.agent,
        [toolId]: value,
      },
    },
  };
}
