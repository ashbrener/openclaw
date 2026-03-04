/**
 * Workspace sync provider modes.
 * - off: no sync
 * - dropbox: Dropbox via rclone
 * - gdrive: Google Drive via rclone
 * - onedrive: OneDrive via rclone
 * - s3: S3-compatible storage via rclone
 * - custom: custom rclone remote (user-configured)
 */
export type WorkspaceSyncProvider = "off" | "dropbox" | "gdrive" | "onedrive" | "s3" | "custom";

/**
 * Workspace sync modes.
 * - mirror: one-way remote→local (default, safest)
 * - bisync: bidirectional via rclone bisync (advanced)
 */
export type WorkspaceSyncMode = "mirror" | "bisync";

/**
 * Workspace sync configuration — matches the plugin configSchema.
 */
export type WorkspaceSyncConfig = {
  provider?: WorkspaceSyncProvider;
  /** Sync mode: "mirror" (remote→local, default) or "bisync" (bidirectional, advanced). */
  mode?: WorkspaceSyncMode;
  /** Enable a local inbox folder that syncs one-way up to the remote workspace. */
  ingest?: boolean;
  /** Local subfolder name for ingestion, relative to localPath (default: "inbox"). */
  ingestPath?: string;
  remotePath?: string;
  localPath?: string;
  interval?: number;
  /** Max seconds to wait for a single rclone sync operation (default: 1800 = 30 min). */
  timeout?: number;
  onSessionStart?: boolean;
  onSessionEnd?: boolean;
  remoteName?: string;
  configPath?: string;
  conflictResolve?: "newer" | "local" | "remote";
  exclude?: string[];
  copySymlinks?: boolean;
  s3?: {
    endpoint?: string;
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  dropbox?: {
    appFolder?: boolean;
    appKey?: string;
    appSecret?: string;
    token?: string;
  };
};
