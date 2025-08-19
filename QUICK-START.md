# Quick Start Guide

## 🚀 Generate Video in 3 Steps

### 1. Add Your Files
```
assets/characters/videos/The_Empress.mp4      ← Character videos
assets/characters/videos/The_Etsy_Queen.mp4
assets/audio/source/dialogue.wav              ← Audio recording
assets/scripts/dialogue.json                  ← Timing script
```

### 2. Set API Key
```bash
export SYNC_API_KEY="sk-HhdApCknRzOs1j-qwdCwRQ.kEntYKk5-gDjkL-X1EjsOeEIMjyR0i_W"
```

### 3. Generate
```bash
npm run start generate \
  --audio assets/audio/source/dialogue.wav \
  --segmentation assets/scripts/dialogue.json \
  --vertical
```

## 📋 Script Format (Super Simple!)
```json
[
  {
    "video": "The_Etsy_Queen",
    "end": 8.5,
    "dialogue": "Your dialogue text here",
    "sync": true
  },
  {
    "video": "Candle_Scene", 
    "end": 10.0,
    "dialogue": "[Atmospheric cutaway]",
    "sync": false
  },
  {
    "video": "The_Empress",
    "end": 15.5, 
    "dialogue": "More dialogue text",
    "sync": true
  }
]
```
**No math required!** Just put the end time, system calculates the start.
**sync: true** = Lip-sync dialogue | **sync: false** = Just video clip

## 📁 Results
- **Horizontal**: `assets/exports/horizontal/video.mp4`
- **Vertical**: `assets/exports/vertical/video_vertical.mp4`

## 🔧 Check Status
```bash
npm run start status
```

That's it! 🎬
