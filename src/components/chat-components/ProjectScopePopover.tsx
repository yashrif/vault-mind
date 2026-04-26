import { type ProjectConfig, useCurrentProject } from "@/aiParams";
import { AddProjectModal } from "@/components/modals/project/AddProjectModal";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchBar } from "@/components/ui/SearchBar";
import { cn } from "@/lib/utils";
import { updateSetting, useSettingsValue } from "@/settings/model";
import { filterProjects } from "@/utils/projectUtils";
import { sortByStrategy } from "@/utils/recentUsageManager";
import { ChevronDown, Edit2, Folder, Globe, Plus, Trash2 } from "lucide-react";
import { Notice } from "obsidian";
import React, { useMemo, useState } from "react";

interface ProjectScopePopoverProps {
  isProject: boolean;
  onSelectAll: () => void;
  onSelectProject: (project: ProjectConfig) => void;
}

/**
 * Scope chip for Agent mode. Opens a popover with project search, creation,
 * editing, and deletion — replacing the old full-screen ProjectList takeover.
 */
export function ProjectScopePopover({
  isProject,
  onSelectAll,
  onSelectProject,
}: ProjectScopePopoverProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const settings = useSettingsValue();
  const [currentProject] = useCurrentProject();

  const sortedProjects = useMemo(
    () =>
      sortByStrategy(settings.projectList ?? [], settings.projectListSortStrategy, {
        getName: (p) => p.name,
        getCreatedAtMs: (p) => p.created,
        getLastUsedAtMs: (p) => p.UsageTimestamps,
      }),
    [settings.projectList, settings.projectListSortStrategy]
  );

  const filteredProjects = useMemo(
    () => filterProjects(sortedProjects, searchQuery),
    [sortedProjects, searchQuery]
  );

  const handleCreate = () => {
    new AddProjectModal(app, async (project) => {
      updateSetting("projectList", [...(settings.projectList ?? []), project]);
    }).open();
  };

  const handleEdit = (project: ProjectConfig) => {
    new AddProjectModal(
      app,
      async (updated) => {
        const newList = (settings.projectList ?? []).map((p) =>
          p.name === project.name ? updated : p
        );
        updateSetting("projectList", newList);
      },
      project
    ).open();
  };

  const handleDelete = (project: ProjectConfig) => {
    new ConfirmModal(
      app,
      () => {
        const newList = (settings.projectList ?? []).filter((p) => p.name !== project.name);
        updateSetting("projectList", newList);
        if (currentProject?.name === project.name) {
          onSelectAll();
        }
        new Notice(`Project "${project.name}" deleted`);
      },
      `Are you sure you want to delete project "${project.name}"?`,
      "Delete Project"
    ).open();
  };

  const handleSelectProject = (project: ProjectConfig) => {
    onSelectProject(project);
    setOpen(false);
  };

  const handleSelectAll = () => {
    onSelectAll();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost2"
          size="fit"
          className={cn("tw-text-sm", isProject ? "tw-text-accent" : "tw-text-muted")}
          title={
            isProject
              ? `Project scope: ${currentProject?.name ?? "none"}`
              : "All notes — click to choose scope"
          }
        >
          {isProject ? (
            <>
              <Folder className="tw-size-4" />
              {currentProject?.name ?? "Project"}
            </>
          ) : (
            <>
              <Globe className="tw-size-4" />
              All notes
            </>
          )}
          <ChevronDown className="tw-mt-0.5 tw-size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="tw-w-72 tw-p-0">
        <div className="tw-flex tw-items-center tw-justify-between tw-border-b tw-border-border tw-px-3 tw-py-2">
          <span className="tw-text-sm tw-font-medium tw-text-normal">Projects</span>
          <Button variant="ghost2" size="icon" onClick={handleCreate} title="New project">
            <Plus className="tw-size-4" />
          </Button>
        </div>
        <div
          className={cn(
            "tw-flex tw-cursor-pointer tw-items-center tw-gap-2 tw-px-3 tw-py-2 hover:tw-bg-modifier-hover",
            !isProject && "tw-text-accent"
          )}
          onClick={handleSelectAll}
        >
          <Globe className="tw-size-4" />
          <span className="tw-text-sm">All notes</span>
        </div>
        <div className="tw-border-t tw-border-border tw-px-3 tw-py-2">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search projects..."
          />
        </div>
        <div className="tw-max-h-64 tw-overflow-y-auto tw-px-2 tw-pb-2">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className={cn(
                "tw-group tw-flex tw-cursor-pointer tw-items-center tw-justify-between tw-gap-2 tw-rounded-md tw-px-2 tw-py-1.5 hover:tw-bg-modifier-hover",
                isProject && currentProject?.id === project.id && "tw-text-accent"
              )}
              onClick={() => handleSelectProject(project)}
            >
              <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-2">
                <Folder className="tw-size-4 tw-shrink-0" />
                <span className="tw-truncate tw-text-sm">{project.name}</span>
              </div>
              <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-0.5 tw-opacity-0 group-hover:tw-opacity-100">
                <Button
                  variant="ghost2"
                  size="icon"
                  title="Edit project"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(project);
                  }}
                >
                  <Edit2 className="tw-size-3.5" />
                </Button>
                <Button
                  variant="ghost2"
                  size="icon"
                  title="Delete project"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(project);
                  }}
                >
                  <Trash2 className="tw-size-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {sortedProjects.length === 0 && (
            <p className="tw-py-4 tw-text-center tw-text-sm tw-text-muted">
              No projects yet. Create one!
            </p>
          )}
          {sortedProjects.length > 0 && searchQuery && filteredProjects.length === 0 && (
            <p className="tw-py-4 tw-text-center tw-text-sm tw-text-muted">No matching projects</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
