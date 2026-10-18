/**
 * A boundary around the studio body, so a render crash shows the reason.
 *
 * The shell has its own boundary, but what it renders for a thrown tab body is an
 * empty pane — indistinguishable from "the plugin does nothing", which is exactly
 * how a CSS/layout or render bug looks to a user. This one keeps the failure
 * inside the panel: the message appears in the pane, and the same text is posted
 * to the host's `/dsh-manim/client-log` so it can be read from disk afterwards
 * without asking the user to open devtools.
 *
 * @module dsh-manim/client/error-boundary
 */

import { Component, useEffect } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import styles from './studio.module.css'

/** Props of {@link PanelBoundary}. */
export interface PanelBoundaryProps {
  /** What to mount. */
  children: ReactNode
  /** Label used in the log line. */
  where: string
}

/** State of {@link PanelBoundary}. */
export interface PanelBoundaryState {
  message: string
  stack: string
}

/** Post one client-side failure to the host, best effort. */
function report(where: string, message: string, stack: string): void {
  try {
    void fetch('/dsh-manim/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ where, message, stack }),
    }).catch(() => {})
  } catch {
    // Reporting must never throw.
  }
}

/**
 * Render-error boundary for one panel body.
 *
 * @param props - the subtree and a label.
 * @returns the children, or the failure text once something throws.
 */
export class PanelBoundary extends Component<PanelBoundaryProps, PanelBoundaryState> {
  state: PanelBoundaryState = { message: '', stack: '' }

  static getDerivedStateFromError(error: unknown): PanelBoundaryState {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? (error.stack ?? '') : ''
    return { message, stack }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const message = `${error.message}\n${info.componentStack ?? ''}`.trim()
    console.error('[dsh-manim] panel crashed:', message)
    report(this.props.where, error.message, `${error.stack ?? ''}\n${info.componentStack ?? ''}`)
  }

  render(): ReactNode {
    if (this.state.message === '') return this.props.children
    return (
      <div className={styles.notice}>
        <p>{`面板渲染出错：${this.state.message}`}</p>
        <p className={styles.small}>{this.props.where}</p>
      </div>
    )
  }
}

/**
 * Report that the panel body mounted.
 *
 * Without it, "nothing appeared" is ambiguous in two very different ways: the body
 * never mounted (a slot problem, nothing to render) or it mounted and threw (the
 * boundary's job). One line in the host log separates them from disk.
 *
 * @param where - label written with the entry.
 */
export function useMountReport(where: string): void {
  useEffect(() => {
    report(where, 'panel body mounted', '')
  }, [where])
}
