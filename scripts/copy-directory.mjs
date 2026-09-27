import { cp, lstat, mkdir, readdir, readFile, readlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const installationMarker = ".ai-coding-toolkit-installed";

export async function copyDirectory(sourceDirectory, destinationDirectory, relativePaths) {
  let existingDirectory;

  try {
    existingDirectory = await lstat(destinationDirectory);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  if (existingDirectory?.isSymbolicLink()) {
    const currentTarget = await readlink(destinationDirectory);
    if (path.resolve(path.dirname(destinationDirectory), currentTarget) === sourceDirectory) {
      await unlink(destinationDirectory);
    } else {
      throw new Error(`Refusing to replace existing link: ${destinationDirectory}`);
    }
  } else if (existingDirectory !== undefined) {
    let installedByToolkit = false;
    if (existingDirectory.isDirectory()) {
      // An empty directory, such as one left by an interrupted installation, holds nothing to preserve.
      const entries = await readdir(destinationDirectory);
      installedByToolkit =
        entries.length === 0 ||
        (entries.includes(installationMarker) &&
          (await readFile(path.join(destinationDirectory, installationMarker), "utf8")) ===
            "ai-coding-toolkit\n");
    }
    if (!installedByToolkit) {
      throw new Error(`Refusing to replace existing path: ${destinationDirectory}`);
    }
  }

  if (relativePaths === undefined) {
    await cp(sourceDirectory, destinationDirectory, { recursive: true, dereference: true });
  } else {
    await mkdir(destinationDirectory, { recursive: true });
    for (const relativePath of relativePaths) {
      await mkdir(path.dirname(path.join(destinationDirectory, relativePath)), { recursive: true });
      await cp(
        path.join(sourceDirectory, relativePath),
        path.join(destinationDirectory, relativePath),
        { recursive: true, dereference: true }
      );
    }
  }
  await writeFile(path.join(destinationDirectory, installationMarker), "ai-coding-toolkit\n");
  console.log(`Installed files: ${destinationDirectory}`);
}
