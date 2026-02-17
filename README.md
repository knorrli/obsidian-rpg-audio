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

## Sidebar

Click the music note icon in the ribbon (or run the **Toggle audio sidebar** command) to open a sidebar that shows all registered tracks with playback controls.

## Commands

- **Toggle audio sidebar** — Show or hide the audio sidebar panel.
- **Stop all audio** — Stop all currently playing tracks.

## Settings

- **Audio folder** — Vault-relative folder where your audio files are stored (default: `audio`).
- **Master volume** — Global volume multiplier applied to all tracks.
- **Auto-open sidebar** — Automatically open the sidebar when the plugin loads.

## Installing

Copy `main.js`, `styles.css`, and `manifest.json` into your vault at `.obsidian/plugins/rpg-audio/`.
