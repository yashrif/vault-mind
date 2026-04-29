import { App, FuzzySuggestModal, TFile } from "obsidian";
import { LEGACY_CHAIN_IDS, type LegacyChainId } from "@/runtime/ChainPreset";
import { isAllowedFileForChainContext } from "@/utils";

export abstract class BaseNoteModal<T> extends FuzzySuggestModal<T> {
  protected activeNote: TFile | null;
  protected availableNotes: T[];
  protected legacyChainId: LegacyChainId;

  constructor(app: App, legacyChainId: LegacyChainId = LEGACY_CHAIN_IDS.AGENT) {
    super(app);
    this.activeNote = app.workspace.getActiveFile();
    this.legacyChainId = legacyChainId;
  }

  protected getOrderedNotes(excludeNotePaths: string[] = []): TFile[] {
    // Get recently opened files first
    const recentFiles = this.app.workspace
      .getLastOpenFiles()
      .map((filePath) => this.app.vault.getAbstractFileByPath(filePath))
      .filter(
        (file): file is TFile =>
          file instanceof TFile &&
          isAllowedFileForChainContext(file, this.legacyChainId) &&
          !excludeNotePaths.includes(file.path) &&
          file.path !== this.activeNote?.path
      );

    // Get all other files that weren't recently opened
    const allFiles = this.app.vault
      .getFiles()
      .filter((file) => isAllowedFileForChainContext(file, this.legacyChainId));

    const otherFiles = allFiles.filter(
      (file) =>
        !recentFiles.some((recent) => recent.path === file.path) &&
        !excludeNotePaths.includes(file.path) &&
        file.path !== this.activeNote?.path
    );

    // Combine active note (if exists and is allowed type) with recent files and other files
    const activeNoteArray =
      this.activeNote && isAllowedFileForChainContext(this.activeNote, this.legacyChainId)
        ? [this.activeNote]
        : [];
    return [...activeNoteArray, ...recentFiles, ...otherFiles];
  }

  protected formatNoteTitle(basename: string, isActive: boolean, extension?: string): string {
    let title = basename;
    if (isActive) {
      title += " (current)";
    }
    if (extension === "pdf") {
      title += " (PDF)";
    } else if (extension === "canvas") {
      title += " (Canvas)";
    }
    return title;
  }
}
