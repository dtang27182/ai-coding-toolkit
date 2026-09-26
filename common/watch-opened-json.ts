export type JsonFileHandle = {
  kind: "file";
  getFile(): Promise<File>;
};

type JsonPickerWindow = Window & {
  showOpenFilePicker?: (options: { types: { description: string; accept: Record<string, string[]> }[] }) => Promise<JsonFileHandle[]>;
};

export function supportsJsonFileHandles(): boolean {
  return typeof (window as JsonPickerWindow).showOpenFilePicker === "function";
}

export async function pickJsonFile(): Promise<{ file: File; handle: JsonFileHandle } | undefined> {
  const picker = window as JsonPickerWindow;
  try {
    const [handle] = await picker.showOpenFilePicker!({
      types: [{ description: "JSON files", accept: { "application/json": [".json"] } }],
    });
    return { file: await handle.getFile(), handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return undefined;
    } else {
      throw error;
    }
  }
}

export async function droppedJsonFile(event: DragEvent): Promise<{ file: File; handle?: JsonFileHandle } | undefined> {
  const item = event.dataTransfer?.items[0] as (DataTransferItem & {
    getAsFileSystemHandle?: () => Promise<JsonFileHandle | { kind: string } | null>;
  }) | undefined;
  const fallbackFile = event.dataTransfer?.files[0];
  const handle = await item?.getAsFileSystemHandle?.();
  if (handle?.kind === "file") {
    const fileHandle = handle as JsonFileHandle;
    return { file: await fileHandle.getFile(), handle: fileHandle };
  } else if (fallbackFile !== undefined) {
    return { file: fallbackFile };
  }
}

export function watchOpenedJson(
  handle: JsonFileHandle,
  initialContents: string,
  onChange: (file: File, contents: string) => Promise<void>,
  onError: (error: unknown) => void,
): () => void {
  let contents = initialContents;
  let checking = false;
  const timer = window.setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const file = await handle.getFile();
      const nextContents = await file.text();
      if (nextContents !== contents) {
        contents = nextContents;
        await onChange(file, nextContents);
      }
    } catch (error) {
      onError(error);
    } finally {
      checking = false;
    }
  }, 1000);
  return () => window.clearInterval(timer);
}
