'use client'

import { useState } from 'react'
import { ChevronDownIcon, FolderIcon } from '@/components/icons'
import type { TreeNode } from '@/lib/fileTree'

const INDENT_PX = 20
const BASE_PADDING_PX = 16

// Recursive folder/file list — folders start collapsed (click the chevron
// to expand), each folder row shows its total nested item count. Each
// screen supplies its own file-row markup via `renderFile` (actions differ:
// clickable+removable in UploadZone, read-only in TransferFlow's review
// step, Preview/Download buttons in DownloadCard), so this component only
// owns the tree-walking and expand/collapse state.
export default function FolderTree<T>({
  tree,
  renderFile,
  depth = 0,
}: {
  tree: TreeNode<T>
  renderFile: (item: T) => React.ReactNode
  depth?: number
}) {
  return (
    <>
      {tree.folders.map((folder) => (
        <FolderRow key={folder.path} folder={folder} renderFile={renderFile} depth={depth} />
      ))}
      {tree.files.map((item, i) => (
        <div key={i}>{renderFile(item)}</div>
      ))}
    </>
  )
}

function FolderRow<T>({
  folder,
  renderFile,
  depth,
}: {
  folder: TreeNode<T>
  renderFile: (item: T) => React.ReactNode
  depth: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: BASE_PADDING_PX + depth * INDENT_PX }}
        className="w-full flex items-center gap-2 pr-4 py-2.5 hover:bg-bg transition-colors text-left"
      >
        <ChevronDownIcon className={`w-3.5 h-3.5 text-muted flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
        <FolderIcon className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        <span className="text-xs font-medium text-text-primary truncate flex-1">{folder.name}</span>
        <span className="text-[11px] text-muted flex-shrink-0">{folder.fileCount} item{folder.fileCount !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div style={{ paddingLeft: INDENT_PX }}>
          <FolderTree tree={folder} renderFile={renderFile} depth={depth + 1} />
        </div>
      )}
    </div>
  )
}
