import {
  TEXT_READABLE_EXTENSIONS,
  NON_PREVIEWABLE_EXTENSIONS,
} from "@/constants";
import { App } from "obsidian";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "avif"];

const EXTENSION_LIST = [
  ...new Set([...IMAGE_EXTENSIONS, ...TEXT_READABLE_EXTENSIONS, ...NON_PREVIEWABLE_EXTENSIONS]),
]
  .map((ext) => `.${ext}`)
  .join(",");

// "image/*" is included explicitly so Electron/browsers correctly report file.type for image files.
const ACCEPT_EXTENSIONS = `image/*,${EXTENSION_LIST}`;

export class AddFileModal {
  private app: App;
  private onFilesSelected: (files: File[]) => void;

  constructor(app: App, onFilesSelected: (files: File[]) => void) {
    this.app = app;
    this.onFilesSelected = onFilesSelected;
  }

  open() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT_EXTENSIONS;
    input.multiple = true;
    input.style.display = "none";

    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      this.onFilesSelected(files);
      document.body.removeChild(input);
    });

    document.body.appendChild(input);
    input.click();
  }
}
