import { withProjectToolOverride } from "@/components/modals/project/projectToolOverrides";
import type { ProjectConfig } from "@/aiParams";

describe("withProjectToolOverride", () => {
  const baseProject: ProjectConfig = {
    id: "project-1",
    name: "Project",
    description: "",
    systemPrompt: "",
    projectModelKey: "model|provider",
    modelConfigs: {},
    contextSource: {},
    toolOverrides: {
      agent: {
        webSearch: true,
      },
    },
    created: 1,
    UsageTimestamps: 1,
  };

  it("sets tri-state agent tool overrides without dropping existing overrides", () => {
    const updated = withProjectToolOverride(baseProject, "writeFile", false);

    expect(updated.toolOverrides?.agent).toEqual({
      webSearch: true,
      writeFile: false,
    });
    expect(updated).not.toBe(baseProject);
  });

  it("stores inherit as an explicit override state", () => {
    const updated = withProjectToolOverride(baseProject, "webSearch", "inherit");

    expect(updated.toolOverrides?.agent?.webSearch).toBe("inherit");
  });
});
