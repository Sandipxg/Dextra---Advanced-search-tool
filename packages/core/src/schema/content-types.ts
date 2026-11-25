import { z } from 'zod'

/**
 * D1 "What kind of content?" — stored as categories, not extensions (D-018).
 * The compiler expands each category to `filetype:` values.
 */
export const ContentTypeSchema = z.enum([
  'web',
  'pdf',
  'word',
  'spreadsheet',
  'presentation',
  'text',
  'dataset',
  'image',
  'video',
  'audio',
])
export type ContentType = z.infer<typeof ContentTypeSchema>

/** `web` means ordinary pages: no `filetype:` operator. */
export const CONTENT_TYPE_EXTENSIONS: Record<ContentType, readonly string[]> = {
  web: [],
  pdf: ['pdf'],
  word: ['doc', 'docx', 'odt', 'rtf'],
  spreadsheet: ['xls', 'xlsx', 'ods'],
  presentation: ['ppt', 'pptx', 'odp'],
  text: ['txt'],
  dataset: ['csv', 'json', 'xml', 'tsv'],
  // Media (D-027): Google indexes far fewer of these than documents.
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
  video: ['mp4', 'webm', 'mov', 'avi', 'mkv'],
  audio: ['mp3', 'wav', 'm4a', 'ogg', 'flac'],
}

/**
 * Media types are served by media templates (Google's Videos / Images tabs, audio sites),
 * not by a `filetype:` layer: Google indexes very few raw media files (D-028).
 */
export const MEDIA_CONTENT_TYPES: readonly ContentType[] = ['image', 'video', 'audio']

/** Extensions for the compiler's `filetype:` content layer (media types left out, D-028). */
export const filetypeLayerExtensions = (types: readonly ContentType[]): string[] => [
  ...new Set(
    types
      .filter((t) => !MEDIA_CONTENT_TYPES.includes(t))
      .flatMap((t) => CONTENT_TYPE_EXTENSIONS[t]),
  ),
]
