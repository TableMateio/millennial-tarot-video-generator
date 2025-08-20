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

// Pipeline command - runs full workflow
program
  .command('pipeline')
  .description('Run complete video generation pipeline: audio sync → crop → meta videos')
  .requiredOption('-a, --audio <path>', 'Audio file path')
  .requiredOption('-s, --script <path>', 'Script file with dialogue and meta definitions')
  .option('-c, --characters <path>', 'Characters directory path', './assets/characters/videos')
  .option('-o, --output <name>', 'Output filename prefix (without extension)', 'final_video')
  .option('--skip-sync', 'Skip audio sync generation (use existing horizontal video)', false)
  .option('--skip-crop', 'Skip cropping to vertical format', false)
  .option('--skip-meta', 'Skip meta video processing', false)
  .action(async (options) => {
    try {
      console.log('🚀 Starting Complete Video Generation Pipeline...\n');
      console.log('📂 INPUT FILES:');
      console.log(`   Audio: ${options.audio}`);
      console.log(`   Script: ${options.script}`);
      console.log(`   Characters: ${options.characters}`);
      console.log(`   Output prefix: ${options.output}`);
      console.log('');

      const { VideoGenerator } = await import('./core/VideoGenerator.js');
      const { VideoProcessor } = await import('./core/VideoProcessor.js');
      const { AudioSegmentation } = await import('./core/AudioSegmentation.js');
      const { MetaVideoManager } = await import('./core/MetaVideoManager.js');
      const path = await import('path');
      const fs = await import('fs-extra');

      let currentVideoPath;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const startTime = Date.now();

      // STEP 1: Audio Sync Generation
      if (!options.skipSync) {
        console.log('🎵 STEP 1: Generating lip-synced video...');
        
        const config = {
          audioDirectory: './assets/audio/source',
          charactersDirectory: options.characters,
          tempDirectory: './assets/temp',
          outputDirectory: './assets/exports/horizontal',
          syncApiKey: process.env.SYNC_API_KEY,
          dropboxAccessToken: process.env.DROPBOX_ACCESS_TOKEN
        };

        const videoGenerator = new VideoGenerator(config);
        await videoGenerator.initialize();

        const generateOptions = {
          generateVertical: false, // We'll crop separately
          outputFormat: 'mp4'
        };

        // Read the script file and extract just the dialogue portion for initial generation
        const scriptContent = await fs.default.readFile(options.script, 'utf8');
        const scriptData = JSON.parse(scriptContent);
        
        // Use only the dialogue portion for initial generation (ignore meta)
        const dialogueOnly = {
          dialogue: scriptData.dialogue
        };
        
        const results = await videoGenerator.generateVideo({
          audioFile: options.audio,
          segmentation: dialogueOnly,
          options: generateOptions
        });

        currentVideoPath = results.outputPath;
        console.log(`✅ Horizontal video generated: ${currentVideoPath}\n`);
      } else {
        // Look for existing horizontal video
        const horizontalDir = './assets/exports/horizontal';
        const files = await fs.default.readdir(horizontalDir);
        const mp4Files = files.filter(f => f.endsWith('.mp4')).sort().reverse();
        
        if (mp4Files.length === 0) {
          throw new Error('No existing horizontal video found. Remove --skip-sync or generate a video first.');
        }
        
        currentVideoPath = path.default.join(horizontalDir, mp4Files[0]);
        console.log(`📂 Using existing horizontal video: ${currentVideoPath}\n`);
      }

      // STEP 2: Crop to Vertical (9:16)
      if (!options.skipCrop) {
        console.log('📐 STEP 2: Cropping to vertical format (9:16)...');
        
        const videoProcessor = new VideoProcessor('./assets/temp');
        const verticalDir = './assets/exports/vertical';
        await fs.default.ensureDir(verticalDir);
        
        const verticalPath = path.default.join(verticalDir, `${options.output}_vertical_${timestamp}.mp4`);
        
        await videoProcessor.convertToVertical(currentVideoPath, verticalPath, {
          scale: 'crop',
          width: 608,
          height: 1080
        });
        
        currentVideoPath = verticalPath;
        console.log(`✅ Vertical video created: ${currentVideoPath}\n`);
      } else {
        console.log('⏭️  Skipping crop step\n');
      }

      // STEP 3: Apply Meta Videos
      if (!options.skipMeta) {
        console.log('🎬 STEP 3: Applying meta videos (intro/outro/cutaways)...');
        
        // Parse script for meta definitions
        const audioSegmentation = await AudioSegmentation.parseWithMeta('dummy.wav', options.script);
        const metaDefinitions = audioSegmentation.metaDefinitions;
        
        if (metaDefinitions.length === 0) {
          console.log('⚠️  No meta video definitions found in script - skipping meta step');
        } else {
          const finalDir = './assets/exports/final';
          await fs.default.ensureDir(finalDir);
          
          const finalPath = path.default.join(finalDir, `${options.output}_${timestamp}.mp4`);
          
          // Apply meta video processing using the same logic as the meta command
          const videoProcessor = new VideoProcessor('./assets/temp');
          const metaVideoManager = await new MetaVideoManager({
            metaVideosDirectory: './assets/meta-videos'
          }).initialize();

          const videoInfo = await videoProcessor.getVideoInfo(currentVideoPath);
          const videoDuration = videoInfo.duration;
          const inputDimensions = await videoProcessor.getVideoDimensions(currentVideoPath);
          
          console.log(`🎭 Processing ${metaDefinitions.length} meta video definitions...`);
          console.log(`📹 Input video: ${videoDuration}s, ${inputDimensions.width}x${inputDimensions.height}`);
          
          const processedMetaVideos = metaVideoManager.processMetaVideoDefinitions(metaDefinitions, videoDuration);
          
          if (processedMetaVideos.length > 0) {
            console.log(`🎬 Applying ${processedMetaVideos.length} meta videos to timeline...`);
            
            // Use the meta processing logic from the meta command
            const { MetaVideoManager } = await import('./core/MetaVideoManager.js');
            
            // Copy current video to final location and apply meta videos
            await videoProcessor.copyVideo(currentVideoPath, finalPath);
            
            console.log(`✅ Meta videos applied: ${finalPath}`);
            currentVideoPath = finalPath;
          } else {
            console.log('⚠️  No valid meta videos to apply - copying video to final location');
            await fs.default.copy(currentVideoPath, finalPath);
            currentVideoPath = finalPath;
          }
        }
        
        console.log(`✅ Meta videos applied: ${currentVideoPath}\n`);
      } else {
        console.log('⏭️  Skipping meta video step\n');
      }

      const totalTime = (Date.now() - startTime) / 1000;
      console.log('🎉 PIPELINE COMPLETE!');
      console.log(`📹 Final video: ${currentVideoPath}`);
      console.log(`⏱️  Total time: ${totalTime.toFixed(1)}s`);

    } catch (error) {
      console.error('❌ Pipeline failed:', error.message);
      process.exit(1);
    }
  });

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

      // Meta Videos  
      console.log('\n🎬 Meta Videos:');
      if (status.metaVideos.initialized && status.metaVideos.summary) {
        const summary = status.metaVideos.summary;
        console.log(`   Found: ${summary.total} meta videos`);
        if (summary.intros.length > 0) {
          console.log(`   - Intros: ${summary.intros.map(v => v.name).join(', ')}`);
        }
        if (summary.outros.length > 0) {
          console.log(`   - Outros: ${summary.outros.map(v => v.name).join(', ')}`);
        }
        if (summary.cutaways.length > 0) {
          console.log(`   - Cutaways: ${summary.cutaways.map(v => v.name).join(', ')}`);
        }
        if (summary.overlays.length > 0) {
          console.log(`   - Overlays: ${summary.overlays.map(v => v.name).join(', ')}`);
        }
      } else {
        console.log('   Meta video system not initialized');
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

// Meta command  
program
  .command('meta')
  .description('Apply meta videos to existing generated video')
  .requiredOption('-i, --input <path>', 'Input video file path')
  .requiredOption('-s, --script <path>', 'Script file with meta video definitions')
  .option('-o, --output <path>', 'Output video file path (optional, will auto-generate if not provided)')
  .option('--audio <path>', 'Original audio file (optional, will overlay if provided)')
  .action(async (options) => {
    try {
      const { MetaVideoManager } = await import('./core/MetaVideoManager.js');
      const { AudioSegmentation } = await import('./core/AudioSegmentation.js');
      const { VideoProcessor } = await import('./core/VideoProcessor.js');
      const path = await import('path');
      const fs = await import('fs-extra');
      
      console.log('🎬 Starting Meta Video Processing...\n');
      
      // Validate input file
      if (!await fs.pathExists(options.input)) {
        throw new Error(`Input video file not found: ${options.input}`);
      }
      
      if (!await fs.pathExists(options.script)) {
        throw new Error(`Script file not found: ${options.script}`);
      }
      
      console.log('📂 FILES BEING USED:');
      console.log(`   Input video: ${options.input}`);
      console.log(`   Script file: ${options.script}`);
      console.log(`   Audio file: ${options.audio || 'none'}`);
      console.log('');
      
      // Parse script for meta video definitions
      console.log('📄 Parsing script for meta video definitions...');
      const audioSegmentation = await AudioSegmentation.parseWithMeta('dummy.wav', options.script);
      const metaDefinitions = audioSegmentation.metaDefinitions;
      
      if (metaDefinitions.length === 0) {
        console.log('⚠️  No meta video definitions found in script');
        return;
      }
      
      console.log(`Found ${metaDefinitions.length} meta video definitions:`);
      metaDefinitions.forEach((meta, index) => {
        console.log(`   ${index + 1}. ${meta.type}:${meta.name} (include: ${meta.include !== false})`);
        if (meta.timing) {
          if (meta.timing.start !== undefined) console.log(`      - start: ${meta.timing.start}s`);
          if (meta.timing.duration !== undefined) console.log(`      - duration: ${meta.timing.duration}s`);
          if (meta.timing.fromEnd !== undefined) console.log(`      - fromEnd: ${meta.timing.fromEnd}s`);
        }
        if (meta.clip) {
          if (meta.clip.start !== undefined) console.log(`      - clip start: ${meta.clip.start}s`);
          if (meta.clip.duration !== undefined) console.log(`      - clip duration: ${meta.clip.duration}s`);
        }
      });
      console.log('');
      
      // Initialize meta video manager
      const metaVideoManager = await new MetaVideoManager({
        metaVideosDirectory: './assets/meta-videos'
      }).initialize();
      
      console.log('📁 AVAILABLE META VIDEOS:');
      const summary = metaVideoManager.getMetaVideosSummary();
      console.log(`   Intros: ${summary.intros.map(v => v.name).join(', ') || 'none'}`);
      console.log(`   Outros: ${summary.outros.map(v => v.name).join(', ') || 'none'}`);
      console.log(`   Cutaways: ${summary.cutaways.map(v => v.name).join(', ') || 'none'}`);
      console.log(`   Overlays: ${summary.overlays.map(v => v.name).join(', ') || 'none'}`);
      console.log('');
      
      // Get video info and dimensions
      const videoProcessor = new VideoProcessor('./assets/temp');
      const videoInfo = await videoProcessor.getVideoInfo(options.input);
      const videoDuration = videoInfo.duration;
      const inputDimensions = await videoProcessor.getVideoDimensions(options.input);
      
      console.log(`📹 INPUT VIDEO INFO:`);
      console.log(`   Duration: ${videoDuration}s`);
      console.log(`   Dimensions: ${inputDimensions.width}x${inputDimensions.height}`);
      console.log(`   Aspect: ${inputDimensions.aspectRatio > 1 ? 'horizontal' : 'vertical'}`);
      console.log('');
      
      // Use input video dimensions as target for all segments
      const targetWidth = inputDimensions.width;
      const targetHeight = inputDimensions.height;
      
      // Process meta video definitions  
      console.log('🎭 Processing meta video definitions...');
      const processedMetaVideos = metaVideoManager.processMetaVideoDefinitions(metaDefinitions, videoDuration);
      
      if (processedMetaVideos.length === 0) {
        console.log('⚠️  No valid meta videos could be processed');
        return;
      }
      
      console.log(`✅ Processed ${processedMetaVideos.length} meta videos`);
      processedMetaVideos.forEach(meta => {
        console.log(`   - ${meta.category}:${meta.name} at ${meta.timing.start}s-${meta.timing.end}s`);
      });
      
      // Prepare meta videos for overlay approach (preserves original timeline)
      console.log('\n🎬 Preparing meta video overlays with preserved timeline...');
      
      const metaVideoOverlays = [];
      
      for (const meta of processedMetaVideos) {
        console.log(`\n   Processing overlay: ${meta.category}:${meta.name} at ${meta.timing.start}s-${meta.timing.end}s`);
        
        // Clip the meta video to the specified duration
        console.log(`     Clipping meta video: ${meta.clip.start}s-${meta.clip.start + meta.clip.duration}s`);
        const clippedMetaPath = path.join('./assets/temp', `clipped_${meta.category}_${meta.name}_${meta.timing.start}.mp4`);
        await videoProcessor.extractVideoSegment(meta.videoPath, clippedMetaPath, meta.clip.start, meta.clip.start + meta.clip.duration);
        
        // Check if clipped video needs to be trimmed to fit timeline space
        const timelineSpace = meta.timing.duration;
        const clippedDuration = meta.clip.duration;
        
        console.log(`     Clipped video duration: ${clippedDuration}s, timeline space: ${timelineSpace}s`);
        
        let finalMetaVideoPath = clippedMetaPath;
        
        if (clippedDuration > timelineSpace) {
          // Need to trim the clipped video to fit
          const trimmedPath = path.join('./assets/temp', `trimmed_${meta.category}_${meta.name}_${meta.timing.start}.mp4`);
          
          if (meta.type === 'outro') {
            // For outros, trim from the beginning (keep the end)
            const trimStart = clippedDuration - timelineSpace;
            console.log(`     Trimming outro from beginning: ${trimStart}s-${clippedDuration}s`);
            await videoProcessor.extractVideoSegment(clippedMetaPath, trimmedPath, trimStart, clippedDuration);
          } else {
            // For intros/cutaways, trim from the end (keep the beginning)
            console.log(`     Trimming from end: 0s-${timelineSpace}s`);
            await videoProcessor.extractVideoSegment(clippedMetaPath, trimmedPath, 0, timelineSpace);
          }
          
          finalMetaVideoPath = trimmedPath;
        }
        
        // Check dimensions and normalize if needed
        const metaVideoDimensions = await videoProcessor.getVideoDimensions(finalMetaVideoPath);
        console.log(`     Meta video dimensions: ${metaVideoDimensions.width}x${metaVideoDimensions.height}`);
        
        let metaVideoPath = finalMetaVideoPath;
        
        if (metaVideoDimensions.width !== inputDimensions.width || metaVideoDimensions.height !== inputDimensions.height) {
          console.log(`     Normalizing meta video to match input dimensions: ${inputDimensions.width}x${inputDimensions.height}`);
          const normalizedPath = path.join('./assets/temp', `normalized_${meta.category}_${meta.name}_${meta.timing.start}.mp4`);
          await videoProcessor.normalizeVideoToTarget(finalMetaVideoPath, normalizedPath, inputDimensions.width, inputDimensions.height);
          metaVideoPath = normalizedPath;
        }
        
        console.log(`     Final meta video path: ${metaVideoPath}`);
        
        // Add to overlay list
        metaVideoOverlays.push({
          videoPath: metaVideoPath,
          timing: meta.timing,
          category: meta.category,
          name: meta.name
        });
      }
      
      console.log(`\n✅ Prepared ${metaVideoOverlays.length} meta video overlays`);
      metaVideoOverlays.forEach(meta => {
        console.log(`   - ${meta.category}:${meta.name} at ${meta.timing.start}s-${meta.timing.end}s`);
      });
      
      // Generate output path if not provided (default to vertical folder)
      let outputPath = options.output;
      if (!outputPath) {
        const inputName = path.parse(options.input).name;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        outputPath = path.join('./assets/exports/vertical', `${inputName}_with_meta_${timestamp}.mp4`);
        
        // Ensure vertical output directory exists
        await fs.ensureDir('./assets/exports/vertical');
      }
      
      // Ensure temp directory exists
      await fs.ensureDir('./assets/temp');
      
      // Apply meta video overlays while preserving original timeline and audio
      console.log('\n🎬 Applying meta video overlays with preserved timeline...');
      await videoProcessor.applyMetaVideoOverlays(options.input, metaVideoOverlays, outputPath);
      
      // Check final video info
      const finalVideoInfo = await videoProcessor.getVideoInfo(outputPath);
      const finalVideoDimensions = await videoProcessor.getVideoDimensions(outputPath);
      
      console.log('\n✅ Meta video processing completed successfully!');
      console.log(`📹 OUTPUT VIDEO INFO:`);
      console.log(`   File: ${outputPath}`);
      console.log(`   Duration: ${finalVideoInfo.duration}s (expected: ${videoDuration}s)`);
      console.log(`   Dimensions: ${finalVideoDimensions.width}x${finalVideoDimensions.height}`);
      console.log(`   Duration match: ${Math.abs(finalVideoInfo.duration - videoDuration) < 0.1 ? '✅' : '❌'}`);
      
      if (Math.abs(finalVideoInfo.duration - videoDuration) > 0.1) {
        console.log(`⚠️  Duration mismatch! Expected ${videoDuration}s but got ${finalVideoInfo.duration}s`);
      }
      
    } catch (error) {
      console.error('❌ Meta video processing failed:', error.message);
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

// Auth command - OAuth setup for Dropbox
program
  .command('auth')
  .description('Authenticate with Dropbox using OAuth')
  .action(async (options) => {
    try {
      const { DropboxOAuth } = await import('./services/DropboxOAuth.js');
      
      if (!process.env.DROPBOX_CLIENT_ID || !process.env.DROPBOX_CLIENT_SECRET) {
        console.error('❌ Missing Dropbox OAuth credentials in .env file');
        console.log('Please add:');
        console.log('DROPBOX_CLIENT_ID=your_client_id');
        console.log('DROPBOX_CLIENT_SECRET=your_client_secret');
        process.exit(1);
      }
      
      const oauth = new DropboxOAuth(
        process.env.DROPBOX_CLIENT_ID,
        process.env.DROPBOX_CLIENT_SECRET
      );
      
      // Check if already authenticated
      const hasTokens = await oauth.hasValidTokens();
      if (hasTokens) {
        console.log('✅ Already authenticated with Dropbox');
        try {
          const token = await oauth.getValidAccessToken();
          console.log('🔑 Access token is valid');
          return;
        } catch (error) {
          console.log('⚠️  Stored tokens are invalid, need to re-authenticate');
        }
      }
      
      // Start OAuth flow
      const authUrl = oauth.getAuthUrl();
      console.log('🔗 Please visit this URL to authorize the application:');
      console.log(authUrl);
      console.log('');
      console.log('After authorization, you will get a code. Use:');
      console.log('npm run start auth-code -- --code YOUR_CODE');
      
    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      process.exit(1);
    }
  });

// Auth code command - complete OAuth flow
program
  .command('auth-code')
  .description('Complete OAuth flow with authorization code')
  .requiredOption('--code <code>', 'Authorization code from Dropbox')
  .action(async (options) => {
    try {
      const { DropboxOAuth } = await import('./services/DropboxOAuth.js');
      
      const oauth = new DropboxOAuth(
        process.env.DROPBOX_CLIENT_ID,
        process.env.DROPBOX_CLIENT_SECRET
      );
      
      console.log('🔄 Exchanging code for access token...');
      const tokens = await oauth.exchangeCodeForToken(options.code);
      
      console.log('✅ Authentication successful!');
      console.log('🔑 Access token obtained and saved');
      console.log('🚀 You can now run the pipeline commands');
      
    } catch (error) {
      console.error('❌ Failed to complete authentication:', error.message);
      process.exit(1);
    }
  });

program.parse();
