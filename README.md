# RPG Audio

Play audio tracks for tabletop RPG sessions directly from your Obsidian notes. Define sound effects, loops, and playlists using simple code blocks, and control them with inline player widgets.

## Usage

Add an `rpg-audio` fenced code block to any note to create an audio player:

````markdown
```rpg-audio
id: tavern-music
name: Tavern Music
file: audio/tavern-ambience.mp3
```
````

This renders an inline player widget with play/pause, stop, and volume controls.

### Fields

| Field   | Required | Description |
|---------|----------|-------------|
| `id`    | Yes      | Unique identifier for the track. Used internally to manage playback state. |
| `name`  | Yes      | Display name shown in the player widget and sidebar. |
| `type`  | No       | Label shown as a badge on the player (e.g. `sfx`, `ambience`, `playlist`). Defaults to `playlist` when multiple files are provided, `sfx` otherwise. |
| `loop`  | No       | `true` or `false`. Whether the track loops after finishing. Defaults to `true` for multi-file tracks, `false` for single-file tracks. |
| `stops`     | No   | Comma-separated list of types to stop when this track starts playing (e.g. `music, ambience`). If a crossfade duration is configured, the outgoing tracks fade out. |
| `file`  | *        | Path to a single audio file, relative to the vault root (e.g. `audio/thunder.mp3`). |
| `files` | *        | A list of audio files (one per line, prefixed with `- `). Files play in order as a playlist. |

\* At least one `file` or `files` entry is required.

### Examples

**Sound effect (one-shot):**

````markdown
```rpg-audio
id: thunder
name: Thunder Clap
type: sfx
file: audio/sfx/thunder.mp3
```
````

**Looping ambience:**

````markdown
```rpg-audio
id: rain
name: Rain
type: ambience
loop: true
file: audio/ambience/rain.mp3
```
````

**Playlist:**

````markdown
```rpg-audio
id: battle-music
name: Battle Music
type: playlist
files:
- audio/music/battle-01.mp3
- audio/music/battle-02.mp3
- audio/music/battle-03.mp3
```
````

Multi-file tracks loop by default. Set `loop: false` to stop after the last file.

**Music tracks that stop other music (only one plays at a time):**

````markdown
```rpg-audio
id: tavern-music
name: Tavern Music
type: music
stops: music
loop: true
file: audio/music/tavern.mp3
```
````

With `stops: music`, starting this track will automatically stop any other playing track that has `type: music`. You can list multiple types separated by commas (e.g. `stops: music, ambience`). If a crossfade duration is configured in settings, the outgoing tracks fade out while the new one fades in.

## URI Links

You can control tracks via URI links, which is useful for map markers or clickable links in notes:

```
obsidian://rpg-audio?action=toggle&id=campfire
```

Supported actions:

| Action   | Description |
|----------|-------------|
| `play`   | Start the track |
| `stop`   | Stop the track |
| `pause`  | Pause the track |
| `toggle` | Play if stopped/paused, stop if playing |

The track must be defined in a visible `rpg-audio` code block. If the track ID is not found, an error notice is shown.

**Markdown link example:**

```markdown
[Campfire sounds](obsidian://rpg-audio?action=toggle&id=campfire)
```

## Sidebar

Click the music note icon in the ribbon (or run the **Toggle audio sidebar** command) to open a sidebar that shows all registered tracks with playback controls.

## Commands

- **Toggle audio sidebar** — Show or hide the audio sidebar panel.
- **Stop all audio** — Stop all currently playing tracks.

## Settings

- **Audio folder** — Vault-relative folder where your audio files are stored (default: `audio`).
- **Master volume** — Global volume multiplier applied to all tracks.
- **Auto-open sidebar** — Automatically open the sidebar when the plugin loads.
- **Crossfade duration** — Duration in milliseconds of the crossfade between exclusive tracks (default: 2000ms). Set to 0 to disable crossfading and use hard stops.

## Installing

Copy `main.js`, `styles.css`, and `manifest.json` into your vault at `.obsidian/plugins/rpg-audio/`.
