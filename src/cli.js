#!/usr/bin/env node

/**
 * CLI interface for the Millennial Tarot Video Generator
 */

import dotenv from 'dotenv';
import { Command } from 'commander';

// Load environment variables from .env file
dotenv.config();
import { VideoGenerator } from './core/VideoGenerator.js';
import fs from 'fs-extra';
import path from 'path';

const program = new Command();

program
  .name('tarot-video-gen')
  .description('AI video generator for Millennial Tarot content with lip-sync')
  .version('1.0.0');

// Generate command
program
  .command('generate')
  .description('Generate lip-sync video from audio and segmentation data')
  .requiredOption('-a, --audio <path>', 'Path to audio file')
  .requiredOption('-s, --segmentation <path>', 'Path to segmentation JSON file')
  .option('-c, --characters <path>', 'Path to characters directory', './assets/characters/videos')
  .option('-o, --output <path>', 'Output directory', './assets/exports/horizontal')
  .option('--sync-api-key <key>', 'Sync API key')
  .option('--vertical', 'Generate vertical version for social media')
  .option('--quality <level>', 'Video quality (low, medium, high, ultra)', 'high')
  .option('--no-cleanup', 'Keep temporary files')
  .action(async (options) => {
    try {
      console.log('🎬 Starting Millennial Tarot Video Generation...\n');

      // Validate inputs
      await validateInputs(options);

      // Load segmentation data
      const segmentationData = await loadSegmentationData(options.segmentation);

      // Create video generator
      const config = {
        charactersDirectory: options.characters,
        outputDirectory: options.output,
        syncApiKey: options.syncApiKey || process.env.SYNC_API_KEY
      };

      const generator = new VideoGenerator(config);
      await generator.initialize();

      // Generation options
      const generationOptions = {
        generateVertical: options.vertical,
        cleanup: options.cleanup,
        video: {
          quality: options.quality
        }
      };

      // Generate video
      const result = await generator.generateVideo({
        audioFile: options.audio,
        segmentation: segmentationData,
        options: generationOptions
      });

      // Output results
      console.log('\n✅ Video generation completed successfully!');
      console.log(`📹 Output: ${result.outputPath}`);
      if (result.verticalOutputPath) {
        console.log(`📱 Vertical: ${result.verticalOutputPath}`);
      }
      console.log(`⏱️  Duration: ${result.duration.toFixed(1)}s`);
      console.log(`🎭 Segments: ${result.segmentCount}`);
      
      if (result.errors && result.errors.length > 0) {
        console.log(`⚠️  Warnings: ${result.failedCount} segments failed`);
        result.errors.forEach(error => {
          console.log(`   - ${error.speaker}: ${error.error}`);
        });
      }

    } catch (error) {
      console.error('❌ Generation failed:', error.message);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Check system status and configuration')
  .option('-c, --characters <path>', 'Path to characters directory', './assets/characters/videos')
  .option('--sync-api-key <key>', 'Sync API key to test')
  .action(async (options) => {
    try {
      const config = {
        charactersDirectory: options.characters,
        syncApiKey: options.syncApiKey || process.env.SYNC_API_KEY
      };

      const generator = new VideoGenerator(config);
      await generator.initialize();

      const status = await generator.getStatus();

      console.log('🔍 System Status:\n');
      
      // Character matcher status
      console.log('👥 Characters:');
      console.log(`   Directory: ${status.directories.characters}`);
      console.log(`   Found: ${status.characterMatcher.charactersFound} character files`);
      
      if (status.characterMatcher.charactersFound > 0) {
        const characters = generator.characterMatcher.getAvailableCharacters();
        characters.forEach(char => {
          console.log(`   - ${char.name} (${char.fileType})`);
        });
      }

      // API status
      console.log('\n🔌 APIs:');
      console.log(`   Sync API Key: ${status.syncAPI.apiKey}`);
      console.log(`   Sync API Status: ${status.syncAPI.initialized ? '✅ Ready' : '❌ Not configured'}`);
      
      if (status.syncAPI.status) {
        console.log(`   API Response: ${JSON.stringify(status.syncAPI.status, null, 2)}`);
      }

      // Directories
      console.log('\n📁 Directories:');
      console.log(`   Characters: ${status.directories.characters}`);
      console.log(`   Output: ${status.directories.output}`);
      console.log(`   Temp: ${status.directories.temp}`);

    } catch (error) {
      console.error('❌ Status check failed:', error.message);
      process.exit(1);
    }
  });

// Format command
program
  .command('format')
  .description('Format existing video (crop horizontal to vertical, etc.)')
  .requiredOption('-i, --input <path>', 'Input video file path')
  .option('-o, --output <path>', 'Output video file path (optional, will auto-generate if not provided)')
  .option('--mode <mode>', 'Conversion mode: crop, fit, fill, auto', 'crop')
  .option('--width <width>', 'Target width in pixels', '1080')
  .option('--height <height>', 'Target height in pixels', '1920')
  .option('--copy', 'Create a copy first for safe testing', false)
  .action(async (options) => {
    try {
      const { VideoProcessor } = await import('./core/VideoProcessor.js');
      const path = await import('path');
      const fs = await import('fs-extra');
      
      console.log('🎬 Starting Video Formatting...\n');
      
      const processor = new VideoProcessor();
      
      // Validate input file
      if (!await fs.pathExists(options.input)) {
        throw new Error(`Input video file not found: ${options.input}`);
      }
      
      let inputPath = options.input;
      
      // Create copy first if requested
      if (options.copy) {
        const inputDir = path.dirname(options.input);
        const inputName = path.parse(options.input).name;
        const inputExt = path.parse(options.input).ext;
        const copyPath = path.join(inputDir, `${inputName}_copy${inputExt}`);
        
        console.log('📋 Creating safe copy for testing...');
        await processor.copyVideo(options.input, copyPath);
        inputPath = copyPath;
        console.log('');
      }
      
      // Generate output path if not provided
      let outputPath = options.output;
      if (!outputPath) {
        const inputDir = path.dirname(inputPath);
        const inputName = path.parse(inputPath).name;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        
        // Create vertical output directory structure
        const verticalDir = inputDir.replace('/horizontal', '/vertical');
        outputPath = path.join(verticalDir, `${inputName}_vertical_${timestamp}.mp4`);
        
        // Ensure output directory exists
        await fs.ensureDir(path.dirname(outputPath));
      }
      
      console.log('🎬 Converting to vertical format...');
      console.log(`📂 Input: ${inputPath}`);
      console.log(`📂 Output: ${outputPath}`);
      console.log(`⚙️  Mode: ${options.mode}`);
      console.log(`📐 Target: ${options.width}x${options.height}`);
      console.log('');
      
      await processor.convertToVertical(inputPath, outputPath, {
        scale: options.mode,
        width: parseInt(options.width),
        height: parseInt(options.height)
      });
      
      console.log('\n✅ Video formatting completed successfully!');
      console.log(`📹 Output: ${outputPath}`);
      
    } catch (error) {
      console.error('❌ Video formatting failed:', error.message);
      process.exit(1);
    }
  });

// Init command
program
  .command('init')
  .description('Initialize project structure and create example files')
  .option('-d, --directory <path>', 'Project directory', './tarot-video-project')
  .action(async (options) => {
    try {
      console.log('🚀 Initializing Tarot Video Generator project...\n');

      const projectDir = path.resolve(options.directory);
      
      // Create directory structure
      await fs.ensureDir(path.join(projectDir, 'assets', 'characters', 'videos'));
      await fs.ensureDir(path.join(projectDir, 'assets', 'characters', 'images'));
      await fs.ensureDir(path.join(projectDir, 'assets', 'audio', 'source'));
      await fs.ensureDir(path.join(projectDir, 'assets', 'audio', 'segments'));
      await fs.ensureDir(path.join(projectDir, 'assets', 'scripts'));
      await fs.ensureDir(path.join(projectDir, 'assets', 'exports', 'horizontal'));
      await fs.ensureDir(path.join(projectDir, 'assets', 'exports', 'vertical'));
      await fs.ensureDir(path.join(projectDir, 'assets', 'temp'));
      await fs.ensureDir(path.join(projectDir, 'config'));

      // Create example configuration
      const exampleConfig = VideoGenerator.createExampleConfig();
      await fs.writeJson(
        path.join(projectDir, 'config.json'),
        exampleConfig,
        { spaces: 2 }
      );

      // Create example segmentation files
      await fs.writeJson(
        path.join(projectDir, 'assets', 'scripts', 'example-timestamps.json'),
        exampleConfig.examples.timestampFormat,
        { spaces: 2 }
      );

      await fs.writeJson(
        path.join(projectDir, 'assets', 'scripts', 'example-sequence.json'),
        exampleConfig.examples.sequenceFormat,
        { spaces: 2 }
      );

      // Create README
      const readme = createReadmeContent();
      await fs.writeFile(path.join(projectDir, 'README.md'), readme);

      // Create environment file
      const envContent = `# Sync API Configuration
SYNC_API_KEY=your-sync-api-key-here

# Optional: Custom directories
# CHARACTERS_DIR=./characters
# OUTPUT_DIR=./output
`;
      await fs.writeFile(path.join(projectDir, '.env.example'), envContent);

      console.log('✅ Project initialized successfully!');
      console.log(`📁 Project directory: ${projectDir}`);
      console.log('\n📋 Next steps:');
      console.log('1. Add character videos to ./assets/characters/videos/');
      console.log('2. Add your audio files to ./assets/audio/source/');
      console.log('3. Create segmentation files in ./assets/scripts/');
      console.log('4. Copy .env.example to .env and add your Sync API key');
      console.log('5. Run: tarot-video-gen generate --help for usage');
      console.log('\n🎬 Example usage:');
      console.log('tarot-video-gen generate \\');
      console.log('  --audio assets/audio/source/dialogue.wav \\');
      console.log('  --segmentation assets/scripts/dialogue.json \\');
      console.log('  --characters assets/characters/videos \\');
      console.log('  --vertical');

    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      process.exit(1);
    }
  });

// Utility functions

async function validateInputs(options) {
  // Check audio file
  if (!await fs.pathExists(options.audio)) {
    throw new Error(`Audio file not found: ${options.audio}`);
  }

  // Check segmentation file
  if (!await fs.pathExists(options.segmentation)) {
    throw new Error(`Segmentation file not found: ${options.segmentation}`);
  }

  // Check characters directory
  if (!await fs.pathExists(options.characters)) {
    throw new Error(`Characters directory not found: ${options.characters}`);
  }

  // Check API key
  if (!options.syncApiKey && !process.env.SYNC_API_KEY) {
    throw new Error('Sync API key required. Use --sync-api-key or set SYNC_API_KEY environment variable');
  }
}

async function loadSegmentationData(segmentationPath) {
  try {
    return await fs.readJson(segmentationPath);
  } catch (error) {
    throw new Error(`Failed to load segmentation data: ${error.message}`);
  }
}

function createReadmeContent() {
  return `# Millennial Tarot Video Generator

This project generates lip-synced character videos from audio files using AI.

## Directory Structure

\`\`\`
├── characters/          # Character images (PNG, JPG) or videos (MP4)
├── audio/              # Source audio files
├── segmentation/       # Audio segmentation data (JSON)
├── output/            # Generated videos
└── config.json        # Configuration file
\`\`\`

## Character Files

Name your character files using this convention:
- \`The_Empress.png\`
- \`The_Etsy_Queen.jpg\`
- \`The_Fool.mp4\`

## Segmentation Formats

### Timestamp Format
\`\`\`json
[
  { "speaker": "The_Empress", "start": 0, "end": 5.2 },
  { "speaker": "The_Etsy_Queen", "start": 5.2, "end": 8.5 }
]
\`\`\`

### Sequence Format
\`\`\`json
{
  "type": "sequence",
  "speakers": ["The_Empress", "The_Etsy_Queen"],
  "durations": [5.2, 3.3]
}
\`\`\`

## Usage

\`\`\`bash
# Generate video
tarot-video-gen generate \\
  --audio ./audio/dialogue.wav \\
  --segmentation ./segmentation/dialogue.json \\
  --characters ./characters \\
  --vertical

# Check status
tarot-video-gen status --characters ./characters

# Get help
tarot-video-gen --help
\`\`\`

## Environment Variables

\`\`\`
SYNC_API_KEY=your-api-key
\`\`\`
`;
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});

program.parse();
