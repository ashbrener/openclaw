# OpenClaw Workspace Sync & Backup Plugin

Sync and back up your OpenClaw agent workspace to cloud storage via [rclone](https://rclone.org/).

**Sync** your workspace to Dropbox, Google Drive, OneDrive, S3, or [70+ providers](https://rclone.org/overview/) with mailbox, mirror, or bisync modes. **Back up** your entire agent system — workspace, config, sessions, memory — as encrypted snapshots to S3, R2, B2, or any rclone backend.

**Zero LLM cost.** All sync operations are pure rclone file operations — they never wake the bot or trigger LLM calls (unless you opt in to inbox notifications).

## Sync modes (breaking change in v2.0)

**`mode` is now required.** Previous versions used bidirectional bisync implicitly. Starting with v2.0, you must explicitly set `"mode"` in your config. The plugin will refuse to start and log an error until `mode` is set. This prevents accidental data loss from an unexpected sync direction.

| Mode      | Direction           | Description                                                                                     |
| --------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `mailbox` | Push + inbox/outbox | Workspace pushes to cloud; users drop files in `_outbox` to send them to the agent. **Safest.** |
| `mirror`  | Remote → Local      | One-way sync: workspace mirrors down to local. Safe — local can never overwrite remote.         |
| `bisync`  | Bidirectional       | Full two-way sync. Powerful but requires careful setup.                                         |

**Upgrading from a previous version?** If you were using bisync before, add `"mode": "bisync"` to your config to preserve the existing behavior. For the safest option, use `"mode": "mailbox"`.

### `mailbox` mode (recommended)

The agent workspace is the source of truth. Each sync cycle:

1. **Push**: `rclone sync` pushes the workspace to the cloud (excluding `_inbox/` and `_outbox/`)
2. **Drain**: `rclone move` pulls files from the cloud `_outbox/` into the workspace `_inbox/`, deleting them from the cloud after transfer

This creates a clean separation:

- **Your local machine** gets a live mirror of the workspace via your cloud provider's desktop app (e.g., Dropbox). You also see an `_outbox/` folder — drop files there to send them to the agent.
- **The agent workspace** has an `_inbox/` folder where incoming files land. The agent (or a skill) can process them from there.

Because the push explicitly excludes `_inbox/**` and `_outbox/**`, there is no risk of sync loops or accidental overwrites. Files only flow in one direction through each channel.

#### Inbox notifications and the `workspace_inbox` tool

By default, mailbox mode is silent — files land in `_inbox` without waking the agent. This keeps costs at zero.

Set `"notifyOnInbox": true` to have the agent notify you (on Telegram, Discord, etc.) when files arrive. The notification includes a list of new files and available workspace directories so the agent can suggest where to put them.

In mailbox mode the plugin also registers a **`workspace_inbox`** agent tool automatically:

| Action | What it does                                                                               |
| ------ | ------------------------------------------------------------------------------------------ |
| `list` | Show all files in `_inbox` (with sizes) and workspace directories (up to 3 levels deep)    |
| `peek` | Inspect a specific inbox file or directory (metadata)                                      |
| `move` | Move files from `_inbox` to a target workspace directory. Creates the directory if needed. |

**End-to-end flow:**

1. Someone drops a file in the cloud `_outbox` folder
2. Next mailbox drain pulls it into the workspace `_inbox`
3. If `notifyOnInbox` is enabled, the agent tells you on your channel: _"New files arrived — where should I put them?"_
4. You reply: _"move them to CODE/myproject"_
5. The agent calls `workspace_inbox` tool → files are moved, agent confirms

The tool enforces path safety — it rejects absolute paths and traversal attempts (`../`).

```json
{
  "mode": "mailbox",
  "provider": "dropbox",
  "remotePath": "",
  "interval": 180,
  "notifyOnInbox": true
}
```

### `mirror` mode

The agent workspace is the source of truth. Every sync cycle copies the latest workspace state down to your local folder. Local files outside the workspace are never sent up.

This is the safest mode: even if something goes wrong, only your local copy is affected — the workspace stays untouched.

### `ingest` option

Want to send files to the agent? Enable `ingest`. This creates a local `inbox/` folder that syncs one-way **up** to the workspace. Drop a file in the inbox — it appears on the remote workspace. The inbox is separate from the mirror, so there is no risk of overwriting workspace files.

```json
{
  "mode": "mirror",
  "ingest": true,
  "ingestPath": "inbox"
}
```

### `bisync` mode (advanced)

Full bidirectional sync using rclone bisync. Changes on either side propagate to the other.

Use this only if you understand the trade-offs:

- Both sides must be in a known-good state before starting
- A `--resync` is required once to establish the baseline — and it copies **everything**
- If bisync state is lost (e.g., after a deploy that wipes ephemeral storage), you must `--resync` again
- Deleted files can reappear if the other side still has them during a resync
- On container platforms (Fly.io, Railway), bisync state lives in ephemeral storage and is lost on every deploy

If you are running on a container platform, `mirror` mode is strongly recommended.

## Setup sequence

Getting sync right depends on doing things in the right order:

1. **Configure the plugin** in `openclaw.json` with your provider credentials and `mode`
2. **Verify the remote** is accessible: `openclaw workspace-sync status`
3. **Run a dry-run first**: `openclaw workspace-sync sync --dry-run`
4. **Run the first sync**: `openclaw workspace-sync sync`
5. **Enable periodic sync** by setting `interval` in your config

Take care when changing config (switching `remotePath`, `localPath`, or `mode`) — always disable periodic sync first, verify the new paths, then re-enable.

## Install

```bash
openclaw plugins install openclaw-workspace-sync
```

Or clone into your extensions directory:

```bash
cd ~/.openclaw/extensions
git clone https://github.com/ashbrener/openclaw-workspace-sync workspace-sync
cd workspace-sync && npm install --omit=dev
```

## Quick start

```bash
# Interactive setup wizard (recommended)
openclaw workspace-sync setup
```

The setup wizard guides you through:

1. Checking/installing rclone
2. Selecting cloud provider
3. Choosing sync mode
4. Dropbox app folder option (for scoped access)
5. Background sync interval
6. OAuth authorization
7. First sync

Or configure manually — see [Configuration](#configuration) below.

## Configuration

Add to your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-workspace-sync": {
        "enabled": true,
        "config": {
          "sync": {
            "provider": "dropbox",
            "mode": "mailbox",
            "remotePath": "",
            "interval": 180,
            "onSessionStart": true,
            "notifyOnInbox": true,
            "exclude": [".git/**", "node_modules/**", "*.log"]
          }
        }
      }
    }
  }
}
```

### Config reference

| Key               | Type     | Default               | Description                                                                                                                                                      |
| ----------------- | -------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`        | string   | `"off"`               | `dropbox` \| `gdrive` \| `onedrive` \| `s3` \| `custom` \| `off`                                                                                                 |
| `mode`            | string   | **required**          | `mailbox` \| `mirror` \| `bisync` — see [Sync modes](#sync-modes-breaking-change-in-v20)                                                                         |
| `ingest`          | boolean  | `false`               | Enable local inbox for sending files to the agent (mirror mode only)                                                                                             |
| `ingestPath`      | string   | `"inbox"`             | Local subfolder name for ingestion (relative to `localPath`)                                                                                                     |
| `notifyOnInbox`   | boolean  | `false`               | Wake the agent when files arrive in `_inbox` (mailbox mode). Off by default — enabling this costs LLM credits per notification.                                  |
| `remotePath`      | string   | `"openclaw-share"`    | Folder name in cloud storage                                                                                                                                     |
| `localPath`       | string   | `""` (workspace root) | Relative subfolder within the workspace to sync. Defaults to the workspace root (e.g. `/data/workspace`). Must be a relative path — absolute paths are rejected. |
| `interval`        | number   | `0`                   | Background sync interval in seconds (0 = manual only, min 60)                                                                                                    |
| `timeout`         | number   | `1800`                | Max seconds for a single rclone sync operation (min 60)                                                                                                          |
| `onSessionStart`  | boolean  | `false`               | Sync when an agent session begins                                                                                                                                |
| `onSessionEnd`    | boolean  | `false`               | Sync when an agent session ends                                                                                                                                  |
| `remoteName`      | string   | `"cloud"`             | rclone remote name                                                                                                                                               |
| `configPath`      | string   | auto                  | Path to rclone.conf                                                                                                                                              |
| `conflictResolve` | string   | `"newer"`             | `newer` \| `local` \| `remote` (bisync only)                                                                                                                     |
| `exclude`         | string[] | `**/.DS_Store`        | Glob patterns to exclude                                                                                                                                         |
| `copySymlinks`    | boolean  | `false`               | Follow symlinks during sync                                                                                                                                      |

### Provider-specific options

**Dropbox with app folder (recommended for security):**

```json
{
  "provider": "dropbox",
  "remotePath": "",
  "dropbox": {
    "appFolder": true,
    "appKey": "your-app-key",
    "appSecret": "your-app-secret",
    "token": "{\"access_token\":\"...\"}"
  }
}
```

**S3 / Cloudflare R2 / Minio:**

```json
{
  "provider": "s3",
  "remotePath": "openclaw-sync",
  "s3": {
    "endpoint": "https://s3.us-east-1.amazonaws.com",
    "bucket": "your-bucket",
    "region": "us-east-1",
    "accessKeyId": "AKID...",
    "secretAccessKey": "SECRET..."
  }
}
```

**Any rclone backend (SFTP, B2, Mega, pCloud, etc.):**

```json
{
  "provider": "custom",
  "remotePath": "openclaw-sync",
  "custom": {
    "rcloneType": "sftp",
    "rcloneOptions": {
      "host": "example.com",
      "user": "deploy",
      "key_file": "/path/to/key"
    }
  }
}
```

## CLI commands

```bash
# Interactive setup wizard
openclaw workspace-sync setup

# Check sync status
openclaw workspace-sync status

# Sync (behavior depends on mode)
openclaw workspace-sync sync

# Preview changes without syncing
openclaw workspace-sync sync --dry-run

# One-way sync (explicit, overrides mode for this run)
openclaw workspace-sync sync --direction pull   # remote -> local
openclaw workspace-sync sync --direction push   # local -> remote

# Force re-establish bisync baseline (bisync mode only)
openclaw workspace-sync sync --resync

# Authorize with cloud provider
openclaw workspace-sync authorize
openclaw workspace-sync authorize --provider gdrive

# List remote files
openclaw workspace-sync list
```

## Auto-sync

### Session hooks

Sync automatically when sessions start or end (zero LLM cost):

```json
{
  "onSessionStart": true,
  "onSessionEnd": false
}
```

### Periodic background sync

Set `interval` to enable automatic background sync (in seconds):

```json
{
  "interval": 300,
  "timeout": 3600
}
```

In `mirror` mode, periodic sync pulls the latest workspace state down to local. In `bisync` mode, it runs a full bidirectional sync.

### External cron (alternative)

```bash
# Add to crontab (crontab -e)
*/5 * * * * openclaw workspace-sync sync >> /var/log/openclaw-sync.log 2>&1
```

## Supported providers

| Provider      | Config value | Auth method          |
| ------------- | ------------ | -------------------- |
| Dropbox       | `dropbox`    | OAuth token          |
| Google Drive  | `gdrive`     | OAuth token          |
| OneDrive      | `onedrive`   | OAuth token          |
| S3/R2/Minio   | `s3`         | Access keys          |
| Custom rclone | `custom`     | Manual rclone config |

For the full list of 70+ providers, see [rclone overview](https://rclone.org/overview/).

## Understanding sync safety

Cloud sync involves two copies of your data. When things go wrong, one side can overwrite the other. Here is what to keep in mind:

**Mirror mode is safe by design.** The remote workspace is the authority. Local is a read-only copy. Even if your local folder is empty, stale, or corrupted, the next sync just re-downloads the workspace. The agent's work is never affected by local state.

**Bisync requires both sides to agree.** Bisync tracks what changed since the last sync. If that tracking state is lost (deploy, disk wipe, moving to a new machine), rclone does not know what changed and requires a `--resync`. A resync copies everything from both sides — if one side has stale or unwanted files, they propagate to the other.

**Common pitfalls to avoid:**

- Changing `remotePath` or `localPath` while periodic sync is enabled
- Running `--resync` without checking both sides first
- Using `bisync` on container platforms where state is ephemeral
- Syncing very large directories (use `exclude` patterns liberally)

**If in doubt, use `mirror` mode.** You can always send files to the agent through the inbox, and you get a reliable local copy of the workspace without any risk.

## Important: `--resync` is destructive (bisync only)

**Never use `--resync` unless you know exactly what it does.** It tells rclone to throw away its knowledge of what has changed and do a full reconciliation — it copies every file from both sides. This means:

- Files you deleted remotely will come back from local (and vice versa)
- It transfers your **entire** sync scope, not just recent changes
- On a large workspace, this can take 30+ minutes and fill your disk

The plugin **never** auto-resyncs. If bisync state is lost, it logs a message telling you to run `--resync` manually — only do this after confirming both sides are correct.

## Dropbox app folder access (recommended)

For better security, create a scoped Dropbox app that only accesses a single folder:

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Click **Create app** > **Scoped access** > **App folder**
3. Name it (e.g., `openclaw-sync`)
4. In **Permissions** tab, enable:
   - `files.metadata.read` / `files.metadata.write`
   - `files.content.read` / `files.content.write`
5. Copy **App key** and **App secret** from Settings

Benefits:

- Token only accesses one folder, not your entire Dropbox
- If token is compromised, blast radius is limited
- Clean separation — sync folder lives under `Apps/`

## Troubleshooting

### Token expired

```bash
openclaw workspace-sync authorize
```

### Conflicts (bisync only)

Files modified on both sides get `.conflict` suffix:

```bash
find <workspace>/shared -name "*.conflict"
```

### Stale lock files

The plugin automatically handles stale rclone lock files. If a sync is interrupted, the next run detects the stale lock, clears it, and retries.

### Sync times out

Increase the `timeout` config (default is 1800s / 30 min):

```json
{ "timeout": 3600 }
```

### Permission errors

```bash
chmod -R 755 <workspace>/shared
```

## Deployment recommendations

If you are running OpenClaw on a cloud container (Fly.io, Railway, Render) or a VPS:

- **Use a separate persistent volume for the workspace.** Container root filesystems are ephemeral — a redeploy wipes everything. Mount a dedicated volume (e.g., Fly.io volumes, EBS, DigitalOcean block storage) at your workspace path so data survives deploys and restarts.
- **Enable daily volume snapshots.** Most cloud providers offer automated snapshots (Fly.io does this by default with 5-day retention). If something goes wrong — a bad sync, accidental deletion, or a failed reorganization — a recent snapshot lets you restore in minutes instead of rebuilding from scratch.
- **Test your restore process.** A backup you have never restored is a backup you do not have. Create a volume from a snapshot at least once to confirm the process works and you know the steps.

These recommendations apply regardless of whether you use this plugin. Cloud sync adds convenience but is not a substitute for proper backups.

## Security notes

- **Token storage**: rclone tokens are stored in `rclone.conf` with `0600` permissions
- **Sensitive files**: Don't sync secrets, API keys, or credentials
- **Encryption**: Consider [rclone crypt](https://rclone.org/crypt/) for sensitive data
- **App folder**: Use Dropbox app folder access for minimal permissions

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm tsgo --noEmit
```

## License

MIT
