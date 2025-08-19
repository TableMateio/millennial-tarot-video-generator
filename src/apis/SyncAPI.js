/**
 * SyncAPI.js
 * Interface for Sync API (lip-sync generation) - docs.sync.so
 * Using official Sync SDK for video-to-video lip synchronization
 */

import { SyncClient } from '@sync.so/sdk';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { DropboxUploader } from '../services/DropboxUploader.js';

export class SyncAPI {
  constructor(apiKey, dropboxToken = null) {
    this.apiKey = apiKey;
    this.client = new SyncClient({ apiKey });
    this.dropboxUploader = dropboxToken ? new DropboxUploader(dropboxToken) : null;
    this.uploadedFiles = []; // Track uploaded files for cleanup
  }

  /**
   * Generate lip-sync video for a character video and audio segment
   * @param {Object} params - Generation parameters
   * @param {string} params.characterVideoPath - Path to character video file
   * @param {string} params.audioPath - Path to audio file
   * @param {Object} params.segment - Audio segment info (startTime, endTime, etc.)
   * @param {Object} params.options - Additional generation options
   */
  async generateLipSync(params) {
    const { characterVideoPath, audioPath, segment, options = {} } = params;

    try {
      // Validate inputs
      await this.validateInputs(characterVideoPath, audioPath);

      console.log(`Generating lip-sync for ${segment.speaker} (${segment.duration}s)...`);

      // Upload temporary files to Dropbox and get shareable URLs for Sync API
      console.log(`🎬 Generating lip-sync: ${path.basename(characterVideoPath)} + ${path.basename(audioPath)}`);
      
      if (!this.dropboxUploader) {
        throw new Error('Dropbox uploader not configured. Please provide DROPBOX_ACCESS_TOKEN.');
      }

      // Upload video and audio files to Dropbox
      console.log('📤 Uploading files to Dropbox...');
      const [videoUpload, audioUpload] = await Promise.all([
        this.dropboxUploader.uploadAndGetShareableLink(characterVideoPath),
        this.dropboxUploader.uploadAndGetShareableLink(audioPath)
      ]);

      // Track uploaded files for cleanup
      this.uploadedFiles.push(videoUpload.dropbox_path, audioUpload.dropbox_path);

      console.log(`✅ Files uploaded - Video: ${videoUpload.url}`);
      console.log(`✅ Files uploaded - Audio: ${audioUpload.url}`);

      // Create generation using the real Sync SDK with URLs
      const generation = await this.client.generations.create({
        model: 'lipsync-2',
        input: [
          { type: 'video', url: videoUpload.url },
          { type: 'audio', url: audioUpload.url }
        ],
        options: {
          sync_mode: options.syncMode || 'bounce',
          ...options
        }
      });

      console.log(`Generation submitted: ${generation.id}`);

      // Poll for completion
      const result = await this.waitForCompletion(generation.id, segment);
      
      return result;

    } catch (error) {
      console.error(`Sync API error for segment ${segment.id}:`, error.message);
      throw new Error(`Failed to generate lip-sync: ${error.message}`);
    }
  }

  /**
   * Validate input files exist and are readable
   */
  async validateInputs(videoPath, audioPath) {
    if (!await fs.pathExists(videoPath)) {
      throw new Error(`Character video not found: ${videoPath}`);
    }
    
    if (!await fs.pathExists(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }
  }

  /**
   * Wait for generation to complete and download result
   */
  async waitForCompletion(generationId, segment, maxAttempts = 600) {
    console.log(`Waiting for completion: ${generationId}...`);
    console.log(`⏰ AI video generation can take several minutes. Please be patient...`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const generation = await this.client.generations.get(generationId);
        
        // Log status every 30 seconds instead of every check
        if (attempt % 10 === 0 || generation.status !== 'PROCESSING') {
          const elapsed = Math.round((attempt * 3) / 60 * 10) / 10; // rough minutes
          console.log(`📊 Status check ${attempt + 1}/${maxAttempts} (${elapsed}m): ${generation.status || 'Unknown'}`);
        }
        
        if (generation.status === 'COMPLETED') {
          console.log(`✅ Generation completed: ${generationId}`);
          
          // Download the result
          const outputPath = await this.downloadResult(generation, segment);
          
          return {
            segmentId: segment.id,
            speaker: segment.speaker,
            videoPath: outputPath,
            duration: segment.duration,
            startTime: segment.startTime,
            endTime: segment.endTime,
            generationId: generationId
          };
          
        } else if (generation.status === 'FAILED') {
          throw new Error(`Generation failed: ${generation.error || 'Unknown error'}`);
          
        } else if (generation.status === 'IN_PROGRESS') {
          // Wait before next poll - progressive backoff
          const waitTime = Math.min(2000 + (attempt * 1000), 10000);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw new Error(`Generation polling failed after ${maxAttempts} attempts: ${error.message}`);
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    throw new Error(`Generation ${generationId} did not complete within expected time`);
  }

  /**
   * Download generation result
   */
  async downloadResult(generation, segment) {
    try {
      const outputPath = path.join(
        process.cwd(), 
        'assets', 
        'temp', 
        `${segment.id}_${segment.speaker}.mp4`
      );

      // Ensure temp directory exists
      await fs.ensureDir(path.dirname(outputPath));

      // Download video from generation output URL
      if (generation.outputUrl) {
        const response = await axios({
          method: 'GET',
          url: generation.outputUrl,
          responseType: 'stream'
        });

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
          writer.on('finish', () => {
            console.log(`Downloaded: ${outputPath}`);
            resolve(outputPath);
          });
          writer.on('error', reject);
        });
      } else {
        throw new Error('No output URL provided in generation result');
      }

    } catch (error) {
      throw new Error(`Failed to download result: ${error.message}`);
    }
  }

  /**
   * Prepare request data for the API
   * Note: This is a placeholder implementation - actual Sync API format may differ
   */
  async prepareRequest({ characterImagePath, audioPath, segment, options }) {
    // Read and encode files (API might require base64 or multipart)
    const imageBuffer = await fs.readFile(characterImagePath);
    const audioBuffer = await fs.readFile(audioPath);

    // Basic request structure - will need to be updated based on actual Sync API docs
    return {
      image: {
        data: imageBuffer.toString('base64'),
        format: path.extname(characterImagePath).substring(1)
      },
      audio: {
        data: audioBuffer.toString('base64'),
        format: path.extname(audioPath).substring(1),
        startTime: segment.startTime,
        endTime: segment.endTime
      },
      settings: {
        quality: options.quality || 'high',
        resolution: options.resolution || '1080p',
        frameRate: options.frameRate || 30,
        // Force vertical output from Sync if possible
        aspectRatio: options.forceVertical ? '9:16' : '16:9',
        outputFormat: 'mp4',
        ...options
      },
      metadata: {
        segmentId: segment.id,
        speaker: segment.speaker
      }
    };
  }

  /**
   * Process API response and handle video download
   */
  async processResponse(response, segment) {
    const { data } = response;

    // Handle different response patterns
    if (data.status === 'completed' && data.videoUrl) {
      // Direct video URL provided
      return await this.downloadVideo(data.videoUrl, segment);
    } else if (data.jobId) {
      // Async processing - need to poll for completion
      return await this.pollForCompletion(data.jobId, segment);
    } else {
      throw new Error('Unexpected API response format');
    }
  }

  /**
   * Download generated video from URL
   */
  async downloadVideo(videoUrl, segment) {
    try {
      const response = await axios.get(videoUrl, { responseType: 'stream' });
      
      // Create output filename
      const outputPath = path.join(
        process.cwd(), 
        'temp', 
        `${segment.id}_${segment.speaker}.mp4`
      );

      // Ensure temp directory exists
      await fs.ensureDir(path.dirname(outputPath));

      // Download video
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`Downloaded video: ${outputPath}`);
          resolve({
            segmentId: segment.id,
            speaker: segment.speaker,
            videoPath: outputPath,
            duration: segment.duration,
            startTime: segment.startTime,
            endTime: segment.endTime
          });
        });
        writer.on('error', reject);
      });

    } catch (error) {
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }

  /**
   * Poll for job completion (for async APIs)
   */
  async pollForCompletion(jobId, segment, maxAttempts = 30) {
    console.log(`Polling for completion of job ${jobId}...`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await this.client.get(`/jobs/${jobId}`);
        const { status, videoUrl, error } = response.data;

        if (status === 'completed' && videoUrl) {
          return await this.downloadVideo(videoUrl, segment);
        } else if (status === 'failed') {
          throw new Error(error || 'Job failed without error message');
        } else if (status === 'processing') {
          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
          continue;
        }

      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw new Error(`Polling failed after ${maxAttempts} attempts: ${error.message}`);
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    throw new Error(`Job ${jobId} did not complete within expected time`);
  }

  /**
   * Batch process multiple segments
   */
  async generateBatch(segments, characterMatcher, options = {}) {
    const results = [];
    const errors = [];

    // Process in batches to avoid overwhelming the API
    const batchSize = options.batchSize || 3;
    
    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (segment) => {
        try {
          // Generate lip-sync video using the pre-resolved character video path
          const result = await this.generateLipSync({
            characterVideoPath: segment.characterVideoPath,
            audioPath: segment.audioPath,
            segment,
            options: options.generationOptions || {}
          });

          return result;

        } catch (error) {
          errors.push({
            segmentId: segment.id,
            speaker: segment.speaker,
            error: error.message
          });
          return null;
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      });

      // Small delay between batches
      if (i + batchSize < segments.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      successful: results,
      errors,
      total: segments.length,
      successCount: results.length,
      errorCount: errors.length
    };
  }

  /**
   * Check API status and rate limits
   */
  async checkStatus() {
    try {
      const response = await this.client.get('/status');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to check API status: ${error.message}`);
    }
  }

  /**
   * Clean up uploaded files from Dropbox
   */
  async cleanup() {
    if (this.dropboxUploader && this.uploadedFiles.length > 0) {
      console.log('🧹 Cleaning up Dropbox uploads...');
      await this.dropboxUploader.cleanupFiles(this.uploadedFiles);
      this.uploadedFiles = [];
    }
  }
}
