/** A file returned by a download action. */
export type DownloadedFile = {
  /** File name. */
  name: string
  /** Media type. */
  mimeType: string
  /** Contents, base64. */
  data: string
}

/**
 * Hands a file returned by a Server Action to the browser as a
 * download. Runs only in the browser.
 *
 * @param file - Name, type and base64 contents.
 */
export function saveDownloadedFile(file: DownloadedFile): void {
  const bytes = Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }))
  const link = document.createElement("a")
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
