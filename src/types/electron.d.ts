export {}

declare global {
  interface Window {
    electronAPI?: {
      selectFile: (filters: { name: string; extensions: string[] }[]) => Promise<{
        filePath: string
        content: string
        fileName: string
      } | null>
      saveReport: (content: string, defaultName: string) => Promise<boolean>
    }
  }
}
