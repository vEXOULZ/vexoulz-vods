// Real images: YouTube thumbnails for VODs and Twitch box art for games. Both CDNs allow CORS, which lets
// vexoulz-ui read the box art's colour (learnGameColors).
import type { Chapter, Vod } from '@vexoulz/vods-core'

/** Box art at `width` (3:4). Handles Twitch's `{width}x{height}` templates and URLs with a size baked in. */
export function boxArt(url: string | null | undefined, width = 144): string | null {
  if (!url) return null
  const size = `${width}x${Math.round((width * 4) / 3)}`
  if (url.includes('{width}x{height}')) return url.replace('{width}x{height}', size)
  return url.replace(/-\d+x\d+(\.\w+)(\?.*)?$/, `-${size}$1$2`)
}

/** Thumbnail for a VOD card: the archive's own, else the first upload's, else the first game upload's. */
export function thumbnailOf(vod: Vod): string | null {
  return vod.thumbnail ?? vod.uploads.find((u) => u.thumbnail)?.thumbnail ?? vod.games.find((g) => g.thumbnail)?.thumbnail ?? null
}

export interface GameArt {
  name: string
  image?: string
}

/** Distinct games in chapter order, each with its box art if any chapter of it has one. */
export function gamesWithArt(chapters: readonly Chapter[]): GameArt[] {
  const out = new Map<string, GameArt>()
  for (const c of chapters) {
    const image = boxArt(c.image) ?? undefined
    const seen = out.get(c.name)
    if (!seen) out.set(c.name, image ? { name: c.name, image } : { name: c.name })
    else if (!seen.image && image) seen.image = image
  }
  return [...out.values()]
}
