// Groups a flat list of items (each with a slash-delimited relative path)
// into a nested folder tree — shared by every screen that lists a batch/
// folder upload (UploadZone's selection preview, TransferFlow's review
// step, DownloadCard's batch list) so the path-splitting logic and item
// counts only live in one place.

export interface TreeNode<T> {
  name: string          // this folder's own name ('' for the invisible root)
  path: string           // full accumulated path, e.g. "photos/2024" ('' for root)
  folders: TreeNode<T>[] // subfolders, sorted alphabetically
  files: T[]              // files directly inside this folder, original order preserved
  fileCount: number      // total files nested anywhere under this node
}

export function buildFileTree<T>(items: T[], getPath: (item: T) => string): TreeNode<T> {
  const root: TreeNode<T> = { name: '', path: '', folders: [], files: [], fileCount: 0 }
  const folderByPath = new Map<string, TreeNode<T>>([['', root]])

  for (const item of items) {
    const segments = getPath(item).split('/').filter(Boolean)
    segments.pop() // drop the file name itself, keep only folder segments
    let parent = root
    let acc = ''
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg
      let folder = folderByPath.get(acc)
      if (!folder) {
        folder = { name: seg, path: acc, folders: [], files: [], fileCount: 0 }
        folderByPath.set(acc, folder)
        parent.folders.push(folder)
      }
      parent = folder
    }
    parent.files.push(item)
  }

  const finalize = (node: TreeNode<T>): number => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name))
    node.fileCount = node.files.length + node.folders.reduce((sum, f) => sum + finalize(f), 0)
    return node.fileCount
  }
  finalize(root)

  return root
}
