/**
 * VideoGenerator.js
 * Main orchestrator that ties together audio segmentation, character matching, and API calls
 */

import { AudioSegmentation } from './AudioSegmentation.js';
import { CharacterMatcher } from './CharacterMatcher.js';
import { SyncAPI } from '../apis/SyncAPI.js';
import { VideoProcessor } from './VideoProcessor.js';
import { MetaVideoManager } from './MetaVideoManager.js';
import fs from 'fs-extra';
import path from 'path';

export class VideoGenerator {
  constructor(config) {
    this.config = {
      charactersDirectory: config.charactersDirectory || './assets/characters/videos',
      outputDirectory: config.outputDirectory || './assets/exports/horizontal',
      verticalOutputDirectory: config.verticalOutputDirectory || './assets/exports/vertical',
      tempDirectory: config.tempDirectory || './assets/temp',
      syncApiKey: config.syncApiKey,
      ...config
    };

    this.characterMatcher = null;
    this.syncAPI = null;
    this.videoProcessor = null;
  }

  /**
   * Initialize all components
   */
  async initialize() {
    console.log('Initializing Video Generator...');

    // Ensure directories exist
    await fs.ensureDir(this.config.outputDirectory);
    await fs.ensureDir(this.config.tempDirectory);

    // Initialize character matcher
    this.characterMatcher = new CharacterMatcher(this.config.charactersDirectory);
    await this.characterMatcher.initialize();

    // Initialize APIs
    if (this.config.syncApiKey) {
      this.syncAPI = new SyncAPI(
        this.config.syncApiKey,
        this.config.dropboxAccessToken || process.env.DROPBOX_ACCESS_TOKEN
      );
    } else {
      console.warn('No Sync API key provided - lip-sync generation will be unavailable');
    }

    // Initialize video processor
    this.videoProcessor = new VideoProcessor(this.config.tempDirectory);

    // Initialize meta video manager
    this.metaVideoManager = await new MetaVideoManager({
      metaVideosDirectory: this.config.metaVideosDirectory || './assets/meta-videos'
    }).initialize();

    console.log('Video Generator initialized successfully');
    return this;
  }

  /**
   * Generate video from audio file and segmentation data
   * @param {Object} params - Generation parameters
   * @param {string} params.audioFile - Path to audio file
   * @param {Object|Array} params.segmentation - Voice segmentation data
   * @param {Object} params.options - Generation options
   */
  async generateVideo(params) {
    const { audioFile, segmentation, options = {} } = params;

    try {
      console.log(`Starting video generation for: ${audioFile}`);

      // Step 1: Parse audio segmentation with meta video support
      console.log('Step 1: Parsing audio segmentation...');
      const audioSegments = await AudioSegmentation.parseWithMeta(audioFile, segmentation);
      const segments = audioSegments.getSegments();
      const metaDefinitions = audioSegments.metaDefinitions;
      
      console.log(`Found ${segments.length} audio segments`);
      if (metaDefinitions.length > 0) {
        console.log(`Found ${metaDefinitions.length} meta video definitions`);
      }

          // Step 2: Validate video-character mapping
    console.log('Step 2: Validating video-character mapping...');
    const videoNames = [...new Set(segments.map(s => s.video || s.speaker))];
    const mappingValidation = this.characterMatcher.validateSpeakerMapping(videoNames);
      
      if (!mappingValidation.valid) {
        await this.handleMappingErrors(mappingValidation);
      }

      console.log('Speaker-character mapping validated:', 
        Object.keys(mappingValidation.matches).length, 'matches found');

      // Step 3: Extract audio segments
      console.log('Step 3: Extracting audio segments...');
      const audioSegmentPaths = await this.extractAudioSegments(audioFile, segments);

      // Step 3.5: Process meta video definitions
      let processedTimeline = segments;
      if (metaDefinitions.length > 0) {
        console.log('Step 3.5: Processing meta videos...');
        const totalDuration = Math.max(...segments.map(s => s.endTime));
        const processedMetaVideos = this.metaVideoManager.processMetaVideoDefinitions(metaDefinitions, totalDuration);
        
        if (processedMetaVideos.length > 0) {
          console.log(`   Applying ${processedMetaVideos.length} meta videos to timeline`);
          processedTimeline = this.metaVideoManager.applyMetaVideos(segments, processedMetaVideos, totalDuration);
          console.log(`   Timeline now has ${processedTimeline.length} segments (including meta videos)`);
        }
      }

          // Step 4: Process segments (sync + non-sync)
    console.log('Step 4: Processing video segments...');
    const processedResults = await this.processAllSegments(processedTimeline, audioSegmentPaths, options);

      // Step 5: Concatenate videos
      console.log('Step 5: Concatenating videos...');
      const finalVideo = await this.concatenateVideos(processedResults, options, audioFile);

      // Step 6: Clean up temporary files (optional)
      if (options.cleanup !== false) {
        console.log('Step 6: Cleaning up temporary files...');
        await this.cleanup(audioSegmentPaths, processedResults);
      }

      console.log(`Video generation completed: ${finalVideo.outputPath}`);
      return finalVideo;

    } catch (error) {
      console.error('Video generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Handle speaker-character mapping errors
   */
  async handleMappingErrors(mappingValidation) {
    const { missing } = mappingValidation;
    
    console.error('Missing character mappings for speakers:', missing);
    
    // Provide suggestions for missing speakers
    for (const speaker of missing) {
      const suggestions = this.characterMatcher.suggestMatches(speaker);
      console.log(`Suggestions for "${speaker}":`, 
        suggestions.slice(0, 3).map(s => `${s.character} (${Math.round(s.similarity * 100)}%)`));
    }

    // List available characters
    const availableCharacters = this.characterMatcher.getAvailableCharacters();
    console.log('Available characters:', availableCharacters.map(c => c.name));

    throw new Error(`Missing character files for speakers: ${missing.join(', ')}`);
  }

  /**
   * Extract individual audio segments from the main audio file
   */
  async extractAudioSegments(audioFile, segments) {
    if (!this.videoProcessor) {
      throw new Error('Video processor not initialized');
    }

    const audioSegmentPaths = {};

    for (const segment of segments) {
      const outputPath = path.join(
        this.config.tempDirectory,
        `audio_${segment.id}.wav`
      );

      console.log(`Extracting audio for ${segment.id}: ${segment.startTime}s to ${segment.endTime}s (${segment.duration}s)`);
      
      await this.videoProcessor.extractAudioSegment(
        audioFile,
        outputPath,
        segment.startTime,
        segment.endTime
      );

      audioSegmentPaths[segment.id] = outputPath;
    }

    return audioSegmentPaths;
  }

  /**
   * Process all segments (both sync and non-sync)
   */
  async processAllSegments(segments, audioSegmentPaths, options) {
    const syncSegments = segments.filter(segment => segment.sync === true);
    const noSyncSegments = segments.filter(segment => segment.sync === false);
    
    console.log(`   Processing ${syncSegments.length} lip-sync segments and ${noSyncSegments.length} cutaway segments`);
    
    // Process lip-sync segments
    let syncResults = { successful: [], errors: [] };
    if (syncSegments.length > 0) {
      console.log('   Generating lip-sync videos...');
      syncResults = await this.generateLipSyncVideos(syncSegments, audioSegmentPaths, options);
    }
    
    // Process non-sync segments (just prepare video clips)
    const cutawayResults = await this.processCutawaySegments(noSyncSegments, audioSegmentPaths, options);
    
    // Combine all results maintaining original order
    const allResults = {
      successful: [...syncResults.successful, ...cutawayResults.successful],
      errors: [...syncResults.errors, ...cutawayResults.errors],
      total: segments.length,
      syncCount: syncSegments.length,
      cutawayCount: noSyncSegments.length
    };
    
    // Sort by original segment order
    allResults.successful.sort((a, b) => {
      const aIndex = segments.findIndex(s => s.id === a.segmentId);
      const bIndex = segments.findIndex(s => s.id === b.segmentId);
      return aIndex - bIndex;
    });
    
    return allResults;
  }

  /**
   * Generate lip-sync videos for sync segments only
   */
  async generateLipSyncVideos(segments, audioSegmentPaths, options) {
    if (!this.syncAPI) {
      throw new Error('Sync API not initialized - cannot generate lip-sync videos');
    }

    const generationOptions = {
      audioPath: null, // Will be set per segment
      generationOptions: options.lipSync || {},
      batchSize: options.batchSize || 1  // Process one at a time to avoid rate limits
    };

    // Prepare segments with their audio paths and preprocess character videos
    console.log('   Preprocessing character videos...');
    const segmentsWithAudio = await Promise.all(segments.map(async (segment) => {
      const videoName = segment.video || segment.speaker;
      const originalVideoPath = path.join(this.config.charactersDirectory, `${videoName}.mp4`);
      
      // Check if the original video file exists
      if (!fs.existsSync(originalVideoPath)) {
        throw new Error(`Video file not found: ${originalVideoPath}`);
      }
      
      // Preprocess video: normalize to 16:9 and clip to audio duration
      const preprocessedVideoPath = path.join(this.config.tempDirectory, `preprocessed_${segment.id}_${videoName}.mp4`);
      await this.videoProcessor.preprocessVideoForLipSync(
        originalVideoPath,
        preprocessedVideoPath,
        segment.duration
      );
      
      return {
        ...segment,
        audioPath: audioSegmentPaths[segment.id],
        characterVideoPath: preprocessedVideoPath,
        originalVideoPath: originalVideoPath
      };
    }));

    // Generate videos in batches
    return await this.syncAPI.generateBatch(
      segmentsWithAudio,
      this.characterMatcher,
      generationOptions
    );
  }

  /**
   * Process cutaway segments (no lip-sync, just video clips)
   */
  async processCutawaySegments(segments, audioSegmentPaths, options) {
    const results = { successful: [], errors: [] };
    
    if (segments.length === 0) {
      return results;
    }
    
    console.log(`   Processing ${segments.length} cutaway segments...`);
    
    for (const segment of segments) {
      try {
        const videoName = segment.video || segment.speaker;
        const character = this.characterMatcher.findCharacter(videoName);
        
        if (!character) {
          throw new Error(`No character video found for: ${videoName}`);
        }
        
        // Create a trimmed version of the character video for this segment duration
        const outputPath = path.join(
          this.config.tempDirectory,
          `${segment.id}_${segment.speaker}_cutaway.mp4`
        );
        
        await fs.ensureDir(path.dirname(outputPath));
        
        // Use video processor to trim the character video to segment duration
        await this.videoProcessor.trimVideo(
          character.filePath,
          outputPath,
          0, // Start from beginning of character video
          segment.duration // Duration of this segment
        );
        
        results.successful.push({
          segmentId: segment.id,
          speaker: segment.speaker,
          videoPath: outputPath,
          duration: segment.duration,
          startTime: segment.startTime,
          endTime: segment.endTime,
          type: 'cutaway'
        });
        
        console.log(`   ✅ Cutaway processed: ${segment.speaker} (${segment.duration}s)`);
        
      } catch (error) {
        console.log(`   ❌ Cutaway failed: ${segment.speaker} - ${error.message}`);
        results.errors.push({
          segmentId: segment.id,
          speaker: segment.speaker,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Concatenate all generated videos into final output
   */
  async concatenateVideos(lipSyncResults, options, originalAudioFile = null) {
    if (!this.videoProcessor) {
      throw new Error('Video processor not initialized');
    }

    const { successful, errors } = lipSyncResults;

    if (successful.length === 0) {
      throw new Error('No videos were successfully generated');
    }

    if (errors.length > 0) {
      console.warn(`${errors.length} segments failed to generate:`, 
        errors.map(e => `${e.speaker}: ${e.error}`));
    }

    // Sort videos by original segment order
    const sortedVideos = successful.sort((a, b) => a.startTime - b.startTime);
    const videoPaths = sortedVideos.map(v => v.videoPath);

    // Generate output filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputFilename = options.outputFilename || `tarot_video_${timestamp}.mp4`;
    const outputPath = path.join(this.config.outputDirectory, outputFilename);

    // First concatenate videos without audio, then overlay original audio
    if (originalAudioFile) {
      console.log('Concatenating videos and overlaying original audio...');
      const videoOnlyPath = outputPath.replace('.mp4', '_video_only.mp4');
      await this.videoProcessor.concatenateVideos(videoPaths, videoOnlyPath, { ...options.video, removeAudio: true });
      await this.videoProcessor.overlayOriginalAudio(videoOnlyPath, originalAudioFile, outputPath);
      
      // Clean up temporary video-only file
      if (await fs.pathExists(videoOnlyPath)) {
        await fs.remove(videoOnlyPath);
      }
    } else {
      // Fallback to regular concatenation
      await this.videoProcessor.concatenateVideos(videoPaths, outputPath, options.video || {});
    }

    // Generate vertical version if requested (temporarily disabled)
    let verticalOutputPath = null;
    if (false && options.generateVertical) {
      verticalOutputPath = path.join(
        this.config.outputDirectory,
        outputFilename.replace('.mp4', '_vertical.mp4')
      );
      
      await this.videoProcessor.convertToVertical(outputPath, verticalOutputPath, options.vertical || {});
    }

    return {
      outputPath,
      verticalOutputPath,
      segmentCount: successful.length,
      failedCount: errors.length,
      duration: sortedVideos.reduce((sum, v) => sum + v.duration, 0),
      errors: errors.length > 0 ? errors : null
    };
  }

  /**
   * Clean up temporary files
   */
  async cleanup(audioSegmentPaths, lipSyncResults) {
    try {
      // Clean up audio segments
      for (const segmentPath of Object.values(audioSegmentPaths)) {
        if (await fs.pathExists(segmentPath)) {
          await fs.remove(segmentPath);
        }
      }

      // Clean up generated video segments
      if (lipSyncResults.successful) {
        for (const result of lipSyncResults.successful) {
          if (await fs.pathExists(result.videoPath)) {
            await fs.remove(result.videoPath);
          }
        }
      }

      // Clean up preprocessed videos
      const preprocessedFiles = await fs.readdir(this.config.tempDirectory);
      for (const file of preprocessedFiles) {
        if (file.startsWith('preprocessed_')) {
          const filePath = path.join(this.config.tempDirectory, file);
          if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
          }
        }
      }

      // Clean up Dropbox uploads
      if (this.syncAPI) {
        await this.syncAPI.cleanup();
      }

      console.log('Temporary files cleaned up');
    } catch (error) {
      console.warn('Failed to clean up some temporary files:', error.message);
    }
  }

  /**
   * Get status of all components
   */
  async getStatus() {
    const status = {
      characterMatcher: {
        initialized: !!this.characterMatcher,
        charactersFound: this.characterMatcher ? this.characterMatcher.getAvailableCharacters().length : 0
      },
      metaVideos: {
        initialized: !!this.metaVideoManager,
        metaVideosFound: this.metaVideoManager ? this.metaVideoManager.metaVideos.size : 0,
        summary: this.metaVideoManager ? this.metaVideoManager.getMetaVideosSummary() : null
      },
      syncAPI: {
        initialized: !!this.syncAPI,
        apiKey: this.config.syncApiKey ? 'configured' : 'missing'
      },
      videoProcessor: {
        initialized: !!this.videoProcessor
      },
      directories: {
        characters: this.config.charactersDirectory,
        output: this.config.outputDirectory,
        temp: this.config.tempDirectory
      }
    };

    // Check API status if available
    if (this.syncAPI) {
      try {
        status.syncAPI.status = await this.syncAPI.checkStatus();
      } catch (error) {
        status.syncAPI.error = error.message;
      }
    }

    return status;
  }

  /**
   * Create a simple example configuration
   */
  static createExampleConfig() {
    return {
      charactersDirectory: './characters',
      outputDirectory: './output',
      tempDirectory: './temp',
      syncApiKey: 'your-sync-api-key-here',
      
      // Example segmentation data formats
      examples: {
        timestampFormat: [
          { speaker: "The_Empress", start: 0, end: 5.2 },
          { speaker: "The_Etsy_Queen", start: 5.2, end: 8.5 },
          { speaker: "The_Empress", start: 8.5, end: 12.0 }
        ],
        
        sequenceFormat: {
          type: 'sequence',
          speakers: ["The_Empress", "The_Etsy_Queen", "The_Empress"],
          durations: [5.2, 3.3, 3.5]
        }
      }
    };
  }
}
