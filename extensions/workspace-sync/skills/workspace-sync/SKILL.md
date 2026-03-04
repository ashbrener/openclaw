---
name: workspace-sync
description: Sync agent workspace with cloud storage (Dropbox, Google Drive, S3, etc.) using rclone.
metadata: {"openclaw":{"emoji":"☁️","requires":{"bins":["rclone"]}}}
---

# workspace-sync

Sync the agent workspace with cloud storage. The default `mirror` mode treats the remote workspace as the source of truth and syncs it down to local. An optional `inbox` folder lets users send files up to the agent.

## Trigger

Use this skill when the user asks to:
- Sync workspace to/from cloud
- Back up workspace files
- Check sync status
- Fix sync issues
- Send files to the agent workspace

## Sync modes

| Mode | Direction | Description |
|------|-----------|-------------|
| `mirror` (default) | Remote -> Local | One-way: workspace mirrors down. Safe — local can never overwrite remote. |
| `bisync` | Bidirectional | Two-way sync. Powerful but requires careful setup. |

With `ingest: true`, a local `inbox/` folder syncs one-way **up** to the remote workspace (additive only, works with any mode).

## Commands

### Check sync status
```bash
openclaw workspace-sync status
```

Shows: provider, mode, last sync time, sync count, error count, running state.

### Trigger manual sync
```bash
openclaw workspace-sync sync
```

In `mirror` mode: pulls latest from remote. In `bisync` mode: runs bidirectional sync.

### Preview changes
```bash
openclaw workspace-sync sync --dry-run
```

### One-way sync (explicit direction)
```bash
openclaw workspace-sync sync --direction pull   # remote -> local
openclaw workspace-sync sync --direction push   # local -> remote
```

### Force re-establish bisync baseline (destructive)
```bash
openclaw workspace-sync sync --resync
```

**WARNING: `--resync` is destructive (bisync only).** It copies ALL files from both sides to make them identical — deleted files come back, and it transfers everything. Only use when you explicitly need to re-establish the bisync baseline. The plugin never auto-resyncs.

### View remote files
```bash
openclaw workspace-sync list
```

## Configuration

Workspace sync is configured via the plugin entry in `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-workspace-sync": {
        "enabled": true,
        "config": {
          "provider": "dropbox",
          "mode": "mirror",
          "remotePath": "openclaw-share",
          "localPath": "shared",
          "interval": 300,
          "timeout": 1800,
          "onSessionStart": true,
          "onSessionEnd": true,
          "ingest": true,
          "ingestPath": "inbox",
          "exclude": [".git/**", "node_modules/**", "*.log"]
        }
      }
    }
  }
}
```

### Config keys

| Key | Default | Description |
|-----|---------|-------------|
| `provider` | `"off"` | `dropbox`, `gdrive`, `onedrive`, `s3`, `custom`, or `off` |
| `mode` | `"mirror"` | `mirror` (remote->local) or `bisync` (bidirectional) |
| `ingest` | `false` | Enable local inbox for sending files to the agent |
| `ingestPath` | `"inbox"` | Local subfolder name for ingestion |
| `remotePath` | `"openclaw-share"` | Folder name in cloud storage |
| `localPath` | `"shared"` | Subfolder within workspace to sync |
| `interval` | `0` | Background sync interval in seconds (0 = manual only, min 60) |
| `timeout` | `1800` | Max seconds for a single sync operation (min 60) |
| `onSessionStart` | `false` | Sync when an agent session begins |
| `onSessionEnd` | `false` | Sync when an agent session ends |
| `conflictResolve` | `"newer"` | `newer`, `local`, or `remote` (bisync only) |
| `exclude` | `**/.DS_Store` | Glob patterns to exclude from sync |

## Automatic sync

When configured, sync runs automatically:
- **On session start**: Pulls latest from cloud (mirror) or runs bisync
- **On session end**: Syncs changes after conversation ends
- **Periodic interval**: Background sync every N seconds (no LLM cost)

## Safety notes

- **Mirror mode is safe by design.** Remote workspace is the authority. Local is a read-only copy.
- **Bisync requires careful setup.** Both sides must agree. If state is lost, `--resync` is needed.
- **On container platforms** (Fly.io, Railway), bisync state is ephemeral — use `mirror` mode.
- **When changing config** (remotePath, localPath, mode), disable periodic sync first, verify, then re-enable.

## Troubleshooting

### "rclone not configured"
Run the setup wizard:
```bash
openclaw workspace-sync setup
```

### "requires --resync" (bisync only)
Bisync state was lost. **Before running `--resync`, verify both sides are correct**:
```bash
openclaw workspace-sync sync --resync
```

### Check rclone directly
```bash
rclone lsd cloud:/
rclone ls cloud:openclaw-share
```

## Notes

- Default mode is `mirror` (remote->local, safest)
- Bisync is available for power users who need bidirectional sync
- Ingest inbox is additive only — cannot delete remote files
- Only `**/.DS_Store` excluded by default — add your own excludes in config
- Sync operations run in background (no LLM tokens used)
