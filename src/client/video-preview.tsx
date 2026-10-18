/**
 * Video preview for the right sidebar's document tab.
 *
 * The shell renders every file the user clicks from the file tree, but its own
 * renderer set covers text, code, images, PDF, HTML and spreadsheets — nothing
 * plays a video. Opening a rendered `.mp4` therefore showed an empty pane, which
 * reads as "the plugin is broken" even though the render itself was fine. This
 * plugin is the one producing those files, so it supplies the renderer.
 *
 * Contract (`packages/client/ui-sidebar-documentpreview`): declare the extension
 * metadata with `ctx.documentPreviews.register({...})`, then register the body on
 * the keyed slot `sidebar.right.tab.document` under the same id.
 * `loading: 'bytes-complete'` hands the body the whole file as bytes, which is
 * what a blob URL needs.
 *
 * Registration is best-effort on purpose: a shell without those two services is
 * a shell where the studio still works, and an external plugin must never take
 * the GUI down over a feature it cannot offer.
 *
 * @module dsh-manim/client/video-preview
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { t } from './i18n.ts'
import styles from './studio.module.css'

/** Extensions this renderer claims. */
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'webm', 'mov', 'ogv']

/** The implementation id, shared by the metadata and the body seat. */
export const VIDEO_PREVIEW_ID = 'dsh-manim-video'

/** MIME per extension; a wrong type makes Safari refuse the source outright. */
const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
}

/** The suffix of an address, lower-cased, without the dot. */
function suffixOf(address: string): string {
  const clean = address.split('?')[0]?.split('#')[0] ?? ''
  const dot = clean.lastIndexOf('.')
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase()
}

/** The slice of `DocumentBodyOwner` this renderer reads. */
export interface VideoBodyOwner {
  content?: { kind?: string; data?: Uint8Array }
  resourceAddress?: string
}

/**
 * The video body: a blob URL for the file's bytes, revoked when they change.
 *
 * @param props - the owner slice the shell hands a document body.
 * @returns the player, or a notice while the bytes are still arriving.
 */
export function VideoBody(props: VideoBodyOwner): JSX.Element {
  const { content, resourceAddress = '' } = props
  const [url, setUrl] = useState<string>('')

  useEffect(() => {
    if (content?.kind !== 'bytes' || content.data === undefined) {
      setUrl('')
      return
    }
    const type = MIME[suffixOf(resourceAddress)] ?? 'video/mp4'
    const next = URL.createObjectURL(new Blob([content.data], { type }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [content, resourceAddress])

  if (url === '') return <div className={styles.notice}>{t('video.loading')}</div>
  return (
    <div className={styles.documentVideoWrap}>
      <video className={styles.documentVideo} src={url} controls playsInline preload="metadata" />
    </div>
  )
}

/**
 * Register the preview, when the shell offers the two services it needs.
 *
 * @param ctx - client root context.
 */
export function registerVideoPreview(ctx: ClientContext): void {
  // A service is only readable after it is injected — reading it off the raw
  // context throws (and, unguarded, that killed startup once). `ctx.inject` is the
  // Cordis way to depend on a service *optionally*: the callback runs when the
  // service appears and never runs when the shell does not offer it, so a host
  // without document previews still gets the studio.
  const runtime = ctx as unknown as {
    inject?: (names: string[], callback: (scope: Record<string, unknown>) => unknown) => unknown
  }
  if (typeof runtime.inject !== 'function') return
  try {
    runtime.inject(['documentPreviews'], (scope) => {
      try {
        registerOn(scope)
      } catch (error) {
        console.error('[dsh-manim] video preview registration failed:', error)
      }
    })
  } catch (error) {
    console.error('[dsh-manim] video preview injection failed:', error)
  }
}

/** Register the metadata and the body against an injected scope. */
function registerOn(scope: Record<string, unknown>): void {
  const previews = scope.documentPreviews as { register?: (definition: Record<string, unknown>) => unknown } | undefined
  if (previews === undefined || typeof previews.register !== 'function') return
  previews.register({
    id: VIDEO_PREVIEW_ID,
    extensions: VIDEO_EXTENSIONS,
    priority: 'extension',
    loading: 'bytes-complete',
    wrap: false,
    title: () => t('video.title'),
  })
  const slots = scope.slots as
    | { inject?: (name: string, fn: () => unknown) => unknown; register?: (...args: unknown[]) => unknown }
    | undefined
  const effect = scope.effect as ((fn: () => unknown, label?: string) => unknown) | undefined
  if (slots === undefined || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return
  const register = slots.register
  effect?.(
    () => slots.inject?.call(slots, 'sidebar.right.tab.document', () => register.call(slots, {
      name: 'sidebar.right.tab.document',
      key: VIDEO_PREVIEW_ID,
      locale: 'manim',
    }, function ManimVideoBody(owner: VideoBodyOwner): JSX.Element {
      return <VideoBody {...owner} />
    })),
    'dsh-manim: video preview body',
  )
  console.info('[dsh-manim] video preview registered')
}
