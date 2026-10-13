// The claude.ai artifact runtime, only as far as Copper Studio uses it (src/studio/save.ts).
//
// The game is published on claude.ai as an Artifact. Inside claude.ai `window.claude.use(name)`
// resolves a capability's functions, or null where this view can't run it (every capability is
// null when the page is opened on its own; a host that never answers resolves null after 10 s).
// Anywhere else `window.claude` is undefined. The full contract is in the artifact-capabilities
// skill (claude.d.ts, artifact.d.ts, user.d.ts, downloads.d.ts).

/** How every capability call rejects: branch on `code`, never on `message`. */
export interface CapabilityError {
  code: string;
  message: string;
}

/** `artifact`: the page publishes a new version of itself (declared when the page is published). */
export interface ArtifactCapability {
  /**
   * Publishes a complete document (starting with <!doctype html>) as the new live version. Every
   * open view reloads to it, this one too. Rejects `conflict` when someone published first (the
   * view is then already reloading to theirs), `not_writer` / `not_granted` for a read-only viewer,
   * `too_large`, `rate_limited`, `upstream_error` (retry once), `invalid_content`...
   */
  publish(html: string): Promise<{ version: string }>;
}

/** `user`: facts about the viewer. Its reads never reject; no declaration needed. */
export interface UserCapability {
  /** Whether this viewer may publish new versions (the owner, or an editor). False without a viewer. */
  canEdit(): Promise<boolean>;
}

/**
 * `downloads`: offers a file to the viewer, who confirms. Rejects `declined` when they say no (never
 * retry that), `rate_limited` while another prompt is open, `unavailable` / `not_granted` where saves are off.
 */
export interface DownloadsCapability {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: 'saved' | 'delivered' }>;
}

export interface ClaudeCapabilities {
  artifact: ArtifactCapability;
  user: UserCapability;
  downloads: DownloadsCapability;
}

export interface ClaudeRuntime {
  use<K extends keyof ClaudeCapabilities>(name: K): Promise<ClaudeCapabilities[K] | null>;
}

declare global {
  interface Window {
    /** The claude.ai artifact runtime; undefined outside claude.ai. */
    claude?: ClaudeRuntime;
  }
}
