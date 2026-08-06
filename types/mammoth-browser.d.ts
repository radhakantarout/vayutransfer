// mammoth's prebuilt browser bundle has no shipped type declarations (only
// the Node entrypoint does) — this is the officially documented browser
// usage path (arrayBuffer input, no fs/path dependency), used by
// components/FilePreviewPanel.tsx for client-side docx preview.
declare module 'mammoth/mammoth.browser' {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>
}
