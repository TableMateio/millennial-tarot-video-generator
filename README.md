# Millennial Tarot AI Video Generator

Professional AI video generation system for creating lip-synced character videos using the Sync API.

## 📁 Project Structure

```
Video Gen/
├── assets/                          # All project assets organized by type
│   ├── characters/                  # Character video files
│   │   ├── videos/                  # Source character videos (.mp4, .mov)
│   │   └── images/                  # Character images (.png, .jpg) - for reference
│   ├── audio/                       # Audio files
│   │   ├── source/                  # Original dialogue audio files
│   │   └── segments/                # Auto-generated audio segments
│   ├── scripts/                     # Dialogue segmentation data
│   │   ├── brownstone-dialogue.json
│   │   └── [other-script-files].json
│   ├── exports/                     # Generated videos
│   │   ├── horizontal/              # 16:9 format videos
│   │   └── vertical/                # 9:16 format videos (social media)
│   └── temp/                        # Temporary processing files
├── config/                          # Configuration files
├── src/                             # Source code
│   ├── core/                        # Core processing modules
│   ├── apis/                        # API integrations
│   └── cli.js                       # Command-line interface
├── package.json                     # Dependencies and scripts
└── README.md                        # This file
```

## 🎬 Character Video Requirements

### Video File Naming Convention
- Use descriptive names: `The_Empress.mp4`, `The_Etsy_Queen.mov`
- Supported formats: MP4, MOV, AVI, WebM
- Place in: `assets/characters/videos/`

### Video Specifications
- **Resolution**: 1080p or higher recommended
- **Duration**: 10-30 seconds minimum (Sync will use segments)
- **Content**: Close-up shots of character face for best lip-sync results
- **Quality**: High quality, well-lit, minimal motion

## 🎵 Audio File Setup

### Source Audio
- Place dialogue files in: `assets/audio/source/`
- Supported formats: WAV, MP3, M4A
- Quality: 44.1kHz, 16-bit minimum

### Segmentation Scripts
- Create JSON files in: `assets/scripts/`
- Define speaker timing and character mapping

Example segmentation format:
```json
{
  "type": "sequence",
  "speakers": ["The_Empress", "The_Etsy_Queen", "The_Empress"],
  "durations": [5.2, 3.3, 4.1],
  "notes": {
    "The_Empress": "Older English woman, wise tone",
    "The_Etsy_Queen": "American millennial, energetic"
  }
}
```

## ⚡ Quick Start

### 1. Setup
```bash
# Install dependencies
npm install

# Set your Sync API key
export SYNC_API_KEY="your-sync-api-key-here"
```

### 2. Add Assets
- Drop character videos into `assets/characters/videos/`
- Add audio files to `assets/audio/source/`
- Create segmentation script in `assets/scripts/`

### 3. Generate Video
```bash
npm run start generate \
  --audio assets/audio/source/dialogue.wav \
  --segmentation assets/scripts/dialogue.json \
  --characters assets/characters/videos \
  --vertical
```

### 4. Find Output
- Horizontal video: `assets/exports/horizontal/`
- Vertical video: `assets/exports/vertical/`

## 🛠️ Advanced Usage

### Check System Status
```bash
npm run start status --characters assets/characters/videos
```

### Initialize New Project
```bash
npm run start init --directory ./new-project
```

### Custom Output Location
```bash
npm run start generate \
  --audio assets/audio/source/dialogue.wav \
  --segmentation assets/scripts/dialogue.json \
  --characters assets/characters/videos \
  --output assets/exports/custom/
```

## 🎭 Character Management

The system automatically matches dialogue speakers to character videos:

- **"The Empress"** → finds `The_Empress.mp4`
- **"Etsy Queen"** → finds `The_Etsy_Queen.mov`
- Smart fuzzy matching handles variations and typos

## 📋 Segmentation Formats

### Timestamp Format
```json
[
  { "speaker": "The_Empress", "start": 0, "end": 5.2 },
  { "speaker": "The_Etsy_Queen", "start": 5.2, "end": 8.5 }
]
```

### Sequence Format (Recommended)
```json
{
  "type": "sequence",
  "speakers": ["The_Empress", "The_Etsy_Queen"],
  "durations": [5.2, 3.3]
}
```

## 🔧 Technical Details

- **Framework**: Node.js with ES modules
- **Video Processing**: FFmpeg integration
- **API**: Official Sync SDK (@sync.so/sdk)
- **Character Matching**: Intelligent fuzzy matching system
- **Output Formats**: MP4 (horizontal 16:9, vertical 9:16)

## 🚀 Production Ready

This system is designed for professional content creation workflows:

- **Batch Processing**: Handle multiple dialogues automatically
- **Error Recovery**: Graceful handling of failed segments
- **Quality Control**: Validation at every step
- **Scalable**: Modular architecture for easy extension
