# Millennial Tarot AI Video Generator - Complete Tutorial

This tutorial will walk you through exactly how to use the system to create professional lip-synced character videos.

## 🎯 What This System Does

**Input**: Character videos + Audio dialogue + Speaker timing
**Output**: Professional lip-synced videos where characters speak your dialogue perfectly

**Example**: Take a 10-second video of "The Empress" character → Add audio of dialogue → Get back a video where The Empress speaks your exact words with perfect lip-sync.

## 📁 Understanding the Project Structure

```
Video Gen/
├── assets/                          # ALL YOUR CONTENT GOES HERE
│   ├── characters/
│   │   └── videos/                  # ← DROP CHARACTER VIDEOS HERE
│   ├── audio/
│   │   └── source/                  # ← DROP AUDIO FILES HERE
│   ├── scripts/                     # ← CREATE DIALOGUE SCRIPTS HERE
│   ├── exports/
│   │   ├── horizontal/              # ← FINAL VIDEOS APPEAR HERE (16:9)
│   │   └── vertical/                # ← FINAL VIDEOS APPEAR HERE (9:16)
│   └── temp/                        # System uses this (ignore)
├── src/                             # System code (don't touch)
├── config/                          # System settings (don't touch)
└── package.json                     # System dependencies (don't touch)
```

## 🚀 Step-by-Step Walkthrough

### Step 1: Set Up Your API Key

```bash
export SYNC_API_KEY="your-sync-api-key-here"
```

**Your key**: `sk-HhdApCknRzOs1j-qwdCwRQ.kEntYKk5-gDjkL-X1EjsOeEIMjyR0i_W`

### Step 2: Prepare Character Videos

**What you need**: Short videos of each character's face
- **Format**: MP4 or MOV files
- **Duration**: 10-30 seconds (system will use segments)
- **Quality**: 1080p recommended, well-lit, clear face view
- **Content**: Character looking at camera, minimal movement

**File naming**: Must match your dialogue speakers
```
assets/characters/videos/
├── The_Empress.mp4          # Older English woman
├── The_Etsy_Queen.mp4       # American millennial
└── The_Fool.mp4             # Any other characters
```

### Step 3: Prepare Your Audio

**What you need**: Clean dialogue recording
- **Format**: WAV, MP3, or M4A
- **Quality**: 44.1kHz, clear speech
- **Content**: Complete dialogue with all speakers

**File location**:
```
assets/audio/source/
└── brownstone-dialogue.wav  # Your recorded dialogue
```

### Step 4: Create Dialogue Script

This tells the system which video to use when, with automatic timing calculation. **Super simple format** - just specify the end time for each segment!

#### Simple Format (Recommended - No Math Required!)
```json
[
  {
    "video": "The_Etsy_Queen",
    "end": 8.5,
    "dialogue": "The way this betch thinks she can manifest a brownstone..."
  },
  {
    "video": "The_Empress", 
    "end": 11.5,
    "dialogue": "You want a reading on your housing prospects?"
  },
  {
    "video": "The_Etsy_Queen",
    "end": 14.0,
    "dialogue": "Should we tell her?"
  }
]
```

**How it works:**
- `video`: Which character video file to use (matches filename)
- `end`: When this segment ends (start is auto-calculated from previous end)
- `dialogue`: The actual words spoken (for future captions/subtitles)
- `sync`: Set to `false` for cutaway scenes with no lip-sync needed (default: `true`)

#### Advanced Options
```json
[
  {
    "video": "The_Etsy_Queen_Angry",    // Use specific video variant
    "start": 0,                        // Override auto-calculated start
    "end": 8.5,
    "dialogue": "I'm so frustrated!",
    "speaker": "Etsy Queen",           // For grouping/credits
    "sync": true                       // Lip-sync this segment
  },
  {
    "video": "Candle_Lighting",        // Cutaway scene
    "end": 11.0,
    "dialogue": "[Atmospheric candle lighting shot]",
    "sync": false                      // No lip-sync, just video clip
  }
]
```

#### Professional Example (Dialogue + Cutaways)
```json
[
  {
    "video": "Intro_Scene",
    "end": 2.0,
    "sync": false,
    "dialogue": "[Opening titles with mystical music]"
  },
  {
    "video": "The_Etsy_Queen_Excited", 
    "end": 8.5,
    "sync": true,
    "dialogue": "Welcome back to Millennial Tarot!"
  },
  {
    "video": "Cards_Closeup",
    "end": 10.0,
    "sync": false,
    "dialogue": "[Close-up of tarot cards being shuffled]"
  },
  {
    "video": "The_Empress_Wise",
    "end": 16.5,
    "sync": true,
    "dialogue": "Today we explore the energy of manifestation."
  }
]
```

**File location**:
```
assets/scripts/
└── brownstone-dialogue.json  # Your dialogue timing
```

### Step 5: Generate Video

Run the magic command:

```bash
npm run start generate \
  --audio assets/audio/source/brownstone-dialogue.wav \
  --segmentation assets/scripts/brownstone-dialogue.json \
  --characters assets/characters/videos \
  --vertical
```

**What happens**:
1. System reads your audio file
2. Splits it into segments based on your script
3. Matches each segment to the right character video
4. Sends each (character video + audio segment) to Sync API
5. Downloads lip-synced results
6. Combines all segments into final video
7. Creates both horizontal (16:9) and vertical (9:16) versions

### Step 6: Get Your Results

**Output files**:
```
assets/exports/horizontal/
└── tarot_video_2024-08-19.mp4      # Ready for YouTube/web

assets/exports/vertical/
└── tarot_video_2024-08-19_vertical.mp4  # Ready for TikTok/Instagram
```

## 🎬 Real Example: Brownstone Dialogue

Let's walk through your actual brownstone dialogue:

### Your Characters
- **The Etsy Queen**: American millennial (5 speaking segments)
- **The Empress**: English older woman (4 speaking segments)

### Your Dialogue Breakdown
```
1. Etsy Queen (8.5s): "The way this betch thinks she can manifest a brownstone..."
2. Empress (3.0s): "You want a reading on your housing prospects?"
3. Etsy Queen (2.5s): "Should we tell her?"
4. Empress (7.0s): "Blind child, you dream of grand estates..."
5. Etsy Queen (6.5s): "For real, babe. You can't feng shui your way..."
6. Empress (6.0s): "The Empress tends her domain with reverence..."
7. Etsy Queen (8.0s): "Totes. The Etsy Queen crafts that shit..."
8. Empress (6.5s): "Honor your dwelling, however modest..."
9. Etsy Queen (9.0s): "So, yeah. Big house energy starts with big vibe energy..."
```

**Total**: 57 seconds, 9 segments

### What You Need to Add
1. **Character videos**: 
   - `assets/characters/videos/The_Empress.mp4`
   - `assets/characters/videos/The_Etsy_Queen.mp4`

2. **Audio recording**: 
   - `assets/audio/source/brownstone-dialogue.wav`

3. **Run the command** (script already created):
   ```bash
   export SYNC_API_KEY="sk-HhdApCknRzOs1j-qwdCwRQ.kEntYKk5-gDjkL-X1EjsOeEIMjyR0i_W"
   
   npm run start generate \
     --audio assets/audio/source/brownstone-dialogue.wav \
     --segmentation assets/scripts/brownstone-dialogue.json \
     --vertical
   ```

## 🛠️ Advanced Usage

### Check System Status
```bash
npm run start status
```

### Generate Only Horizontal
```bash
npm run start generate \
  --audio assets/audio/source/dialogue.wav \
  --segmentation assets/scripts/dialogue.json
```

### Custom Output Location
```bash
npm run start generate \
  --audio assets/audio/source/dialogue.wav \
  --segmentation assets/scripts/dialogue.json \
  --output assets/exports/custom/
```

### Different Quality Settings
```bash
npm run start generate \
  --audio assets/audio/source/dialogue.wav \
  --segmentation assets/scripts/dialogue.json \
  --quality ultra
```

## 🔧 Troubleshooting

### "Character not found"
**Problem**: System can't match speaker name to video file
**Solution**: Check file naming
- Speaker: `"The_Empress"` → File: `The_Empress.mp4`
- Speaker: `"Etsy Queen"` → File: `The_Etsy_Queen.mp4` or `Etsy_Queen.mp4`

### "Audio file not found"
**Problem**: System can't find your audio file
**Solution**: Check file path and format
- Use: `assets/audio/source/your-file.wav`
- Supported: WAV, MP3, M4A

### "Sync API error"
**Problem**: API key or connection issue
**Solution**: 
1. Check API key is set: `echo $SYNC_API_KEY`
2. Check internet connection
3. Verify API key is valid

### "No video output"
**Problem**: Generation completed but no video found
**Solution**: Check `assets/exports/horizontal/` and `assets/exports/vertical/`

## 📋 Best Practices

### Character Videos
- **Close-up shots**: Face should fill most of the frame
- **Good lighting**: Well-lit, minimal shadows
- **Minimal movement**: Slight head movement OK, no big gestures
- **Clean audio**: Silent or very quiet background

### Audio Files
- **Clear speech**: No background music during dialogue
- **Consistent volume**: All speakers at similar levels
- **Clean cuts**: Minimal silence between speakers

### Dialogue Scripts
- **Exact timing**: Be precise with durations
- **Speaker names**: Match video filenames exactly
- **Test small**: Start with short dialogues first

## 🎯 Production Tips

### Batch Processing
Create multiple script files for different dialogues:
```
assets/scripts/
├── brownstone-dialogue.json        # Your brownstone dialogue
├── brownstone-with-cutaways.json   # Enhanced with cutaway scenes  
├── example-complete.json           # Reference example showing all features
└── your-custom-dialogue.json       # Your new dialogues
```

### Version Control
Keep originals safe:
```
assets/audio/source/
├── originals/           # Keep master recordings here
├── brownstone-v1.wav    # Working versions
└── brownstone-final.wav
```

### Quality Control
Always preview results before publishing:
1. Check lip-sync accuracy
2. Verify audio quality
3. Test on different devices
4. Confirm both horizontal/vertical versions

## 🚀 You're Ready!

The system is production-ready. Add your character videos and audio, then run the generation command. You'll have professional lip-synced videos in minutes!

**Next steps**:
1. Create/collect your character videos
2. Record your brownstone dialogue
3. Run the generation command
4. Share your amazing AI videos!
