const FILES = [
  { key: 'oldUiDsl', label: 'Old UI', suffix: '.old.ui.dsl' },
  { key: 'newUiDsl', label: 'New UI', suffix: '.new.ui.dsl' },
  { key: 'diffUiJson', label: 'Diff', suffix: '.diff.ui.json' },
] as const

export type ManifestTab = typeof FILES[number]['key']
export interface ManifestFile { key: ManifestTab; label: string; path: string }

export function manifestFiles(value: unknown): ManifestFile[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a UI design manifest')
  const fields = value as Record<string, unknown>
  const files: ManifestFile[] = []
  for (const file of FILES) {
    const reference = fields[file.key]
    if (reference === undefined) continue
    if (typeof reference !== 'string' || !reference.endsWith(file.suffix) ||
      (!reference.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(reference))) {
      throw new Error(`Invalid ${file.key} path in UI design manifest`)
    }
    files.push({ key: file.key, label: file.label, path: reference })
  }
  if (files.length === 0) throw new Error('UI design manifest has no UI files')
  return files
}
