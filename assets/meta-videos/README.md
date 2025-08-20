# Meta Videos

This directory contains meta videos that can be used to enhance your generated content.

## Directory Structure

- **`intros/`** - Opening videos that appear at the beginning
- **`outros/`** - Ending videos that appear at the end or before music ends
- **`cutaways/`** - Videos that replace dialogue segments (transitions, graphics, etc.)
- **`overlays/`** - Videos that overlay on top of existing content (future feature)

## Supported Formats

- `.mp4` (recommended)
- `.mov`
- `.avi`
- `.mkv`

## Usage in Scripts

Add meta video definitions to your script JSON files:

```json
{
  "meta": [
    {
      "type": "intro",
      "name": "tarot-intro",
      "timing": {
        "start": 0,
        "duration": 3
      },
      "clip": {
        "start": 0,
        "duration": 3
      },
      "position": "before"
    },
    {
      "type": "outro", 
      "name": "tarot-outro",
      "timing": {
        "fromEnd": 5
      },
      "position": "replace"
    }
  ],
  "dialogue": [
    // ... your regular dialogue segments
  ]
}
```

## Timing Options

- **`start`** - Absolute start time in seconds
- **`end`** - Absolute end time in seconds  
- **`duration`** - Duration from start time
- **`fromEnd`** - Seconds from the end (for outros)
- **`offset`** - Adjustment offset

## Clipping Options

- **`start`** - Start time in source video (default: 0)
- **`end`** - End time in source video
- **`duration`** - Duration from start (alternative to end)

## Position Types

- **`replace`** - Replace existing dialogue at specified time
- **`before`** - Insert before main content (extends total duration)  
- **`after`** - Insert after main content (extends total duration)
- **`overlay`** - Overlay on existing content (future feature)

## Examples

See `assets/scripts/example-with-meta-videos.json` for a complete example.
