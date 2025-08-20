/**
 * VideoProcessor.js
 * Handles video operations like extraction, concatenation, and format conversion using FFmpeg
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs-extra';
import path from 'path';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

export class VideoProcessor {
  constructor(tempDirectory) {
    this.tempDirectory = tempDirectory;
  }

  /**
   * Normalize video to standard 16:9 format with centering and black padding
   */
  async normalizeVideo(inputVideoPath, outputVideoPath, options = {}) {
    const targetWidth = options.width || 1920;
    const targetHeight = options.height || 1080;

    return new Promise((resolve, reject) => {
      console.log(`Normalizing video: ${path.basename(inputVideoPath)} to ${targetWidth}x${targetHeight}`);
      
      ffmpeg(inputVideoPath)
        .videoFilters([
          // Scale to fit within target dimensions while maintaining aspect ratio
          `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
          // Pad to exact dimensions with black bars
          `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`
        ])
        .outputOptions([
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'medium',
          '-crf', '23'
        ])
        .output(outputVideoPath)
        .on('start', (commandLine) => {
          console.log(`FFmpeg command: ${commandLine}`);
        })
        .on('end', () => {
          console.log(`Video normalization completed: ${outputVideoPath}`);
          resolve(outputVideoPath);
        })
        .on('error', (error) => {
          console.error(`Video normalization failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Trim video to specific duration
   */
  async trimVideo(inputVideoPath, outputVideoPath, startTime, duration) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputVideoPath)
        .seekInput(startTime)
        .duration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        .format('mp4')
        .output(outputVideoPath)
        .on('start', (commandLine) => {
          console.log(`Trimming video: ${path.basename(inputVideoPath)} (${duration}s)`);
        })
        .on('end', () => {
          console.log(`Video trimmed: ${outputVideoPath}`);
          resolve(outputVideoPath);
        })
        .on('error', (error) => {
          console.error(`Video trimming failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Preprocess video for lip-sync: normalize format and clip to audio duration
   */
  async preprocessVideoForLipSync(inputVideoPath, outputVideoPath, audioDuration, options = {}) {
    const targetWidth = options.width || 1920;
    const targetHeight = options.height || 1080;

    // Get video info for logging
    const videoInfo = await this.getVideoInfo(inputVideoPath);
    const videoDuration = videoInfo.duration;
    
    console.log(`Preprocessing video: ${path.basename(inputVideoPath)} (${videoDuration}s, will sync to ${audioDuration}s audio)`);

    return new Promise((resolve, reject) => {
      // Simple preprocessing: just normalize format, let Sync API handle duration with bounce mode
      ffmpeg(inputVideoPath)
        .videoFilters([
          `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
          `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`
        ])
        .outputOptions([
          '-c:v', 'libx264',
          '-c:a', 'aac', // Keep audio for Sync API
          '-preset', 'medium',
          '-crf', '23'
        ])
        .output(outputVideoPath)
        .on('start', (commandLine) => {
          console.log(`FFmpeg preprocessing: ${commandLine}`);
        })
        .on('end', () => {
          console.log(`Video preprocessing completed: ${outputVideoPath}`);
          resolve(outputVideoPath);
        })
        .on('error', (error) => {
          console.error(`Video preprocessing failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Extract video segment from video file
   */
  async extractVideoSegment(inputVideoPath, outputVideoPath, startTime, endTime) {
    const duration = endTime - startTime;
    
    return new Promise((resolve, reject) => {
      console.log(`🎬 Extracting video segment: ${startTime}s-${endTime}s (${duration}s)`);
      
      ffmpeg(inputVideoPath)
        .seekInput(startTime)
        .duration(duration)
        .outputOptions([
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'medium',
          '-crf', '23',
          '-r', '24',                    // Force 24fps for all segments
          '-avoid_negative_ts', 'make_zero'  // Handle timestamp issues
        ])
        .output(outputVideoPath)
        .on('start', (commandLine) => {
          console.log(`FFmpeg extract: ${commandLine}`);
        })
        .on('end', () => {
          console.log(`✅ Video segment extracted: ${outputVideoPath}`);
          resolve(outputVideoPath);
        })
        .on('error', (error) => {
          console.error(`❌ Video extraction failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Extract audio segment from larger audio file
   */
  async extractAudioSegment(inputAudioPath, outputAudioPath, startTime, endTime) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputAudioPath)
        .seekInput(startTime)
        .duration(endTime - startTime)
        .audioCodec('pcm_s16le') // WAV format for compatibility
        .format('wav')
        .output(outputAudioPath)
        .on('end', () => {
          console.log(`Extracted audio segment: ${outputAudioPath}`);
          resolve(outputAudioPath);
        })
        .on('error', (error) => {
          console.error(`Failed to extract audio segment: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Concatenate multiple video files into one
   */
  async concatenateVideos(videoPaths, outputPath, options = {}) {
    if (videoPaths.length === 0) {
      throw new Error('No videos provided for concatenation');
    }

    if (videoPaths.length === 1) {
      // Single video - just copy
      await fs.copy(videoPaths[0], outputPath);
      return outputPath;
    }

    // Create concat file for FFmpeg
    const concatFilePath = path.join(this.tempDirectory, 'concat_list.txt');
    const concatContent = videoPaths
      .map(videoPath => `file '${path.resolve(videoPath)}'`)
      .join('\n');
    
    await fs.writeFile(concatFilePath, concatContent);

    return new Promise((resolve, reject) => {
      const command = ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .videoCodec(options.videoCodec || 'libx264')
        .format('mp4');
      
      // Handle audio based on options
      if (options.removeAudio) {
        command.noAudio(); // Remove audio completely
      } else {
        command.audioCodec(options.audioCodec || 'aac');
      }

      // Set quality options
      if (options.quality) {
        command.videoBitrate(this.getVideoBitrate(options.quality));
        command.audioBitrate(this.getAudioBitrate(options.quality));
      }

      // Set resolution if specified
      if (options.resolution) {
        command.size(options.resolution);
      }

      // Set frame rate
      if (options.frameRate) {
        command.fps(options.frameRate);
      }

              command
        .outputOptions([
          '-avoid_negative_ts', 'make_zero',  // Handle timestamp issues
          '-fflags', '+genpts',               // Generate timestamps
          '-r', '24'                          // Force consistent frame rate
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('Starting video concatenation...');
          console.log('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Concatenation progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', async () => {
          console.log(`Video concatenation completed: ${outputPath}`);
          // Clean up concat file
          try {
            await fs.remove(concatFilePath);
          } catch (error) {
            console.warn('Failed to remove concat file:', error.message);
          }
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error(`Video concatenation failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Convert horizontal video to vertical format for social media
   */
  async convertToVertical(inputPath, outputPath, options = {}) {
    const verticalOptions = {
      width: options.width || 1080,
      height: options.height || 1920,
      backgroundColor: options.backgroundColor || 'black',
      scale: options.scale || 'crop', // 'fit', 'fill', 'crop', 'auto'
      ...options
    };

    console.log(`🎬 Converting horizontal video to vertical (${verticalOptions.width}x${verticalOptions.height})...`);
    console.log(`📂 Input: ${path.basename(inputPath)}`);
    console.log(`📂 Output: ${path.basename(outputPath)}`);
    console.log(`⚙️  Scale mode: ${verticalOptions.scale}`);

    return new Promise((resolve, reject) => {
      let videoFilters;

      if (verticalOptions.scale === 'fit') {
        // Scale to fit within vertical bounds, add padding (pillarbox)
        videoFilters = [
          `scale=${verticalOptions.width}:${verticalOptions.height}:force_original_aspect_ratio=decrease`,
          `pad=${verticalOptions.width}:${verticalOptions.height}:(ow-iw)/2:(oh-ih)/2:${verticalOptions.backgroundColor}`
        ];
      } else if (verticalOptions.scale === 'fill') {
        // Scale to fill vertical bounds, crop if necessary
        videoFilters = [
          `scale=${verticalOptions.width}:${verticalOptions.height}:force_original_aspect_ratio=increase`,
          `crop=${verticalOptions.width}:${verticalOptions.height}`
        ];
      } else if (verticalOptions.scale === 'crop') {
        // PURE CENTER CROP: Remove equal amounts from left and right sides
        // From 1920x1080 input, crop center to true 9:16 aspect ratio
        // For 9:16 with height 1080: width = 1080 * 9/16 = 607.5 ≈ 608
        const sourceWidth = 1920;  // Our generated videos are 1920x1080
        const sourceHeight = 1080;
        const cropWidth = Math.round(sourceHeight * 9 / 16);  // Calculate 9:16 width: 608px
        const xOffset = (sourceWidth - cropWidth) / 2;  // Center horizontally
        
        console.log(`📐 9:16 crop calculation: ${cropWidth}x${sourceHeight} (removing ${xOffset}px from each side)`);
        
        videoFilters = [
          `crop=${cropWidth}:${sourceHeight}:${xOffset}:0`  // Perfect 9:16 center crop
        ];
      } else {
        // Auto: intelligent scaling based on content (default to fit)
        videoFilters = [
          `scale=${verticalOptions.width}:${verticalOptions.height}:force_original_aspect_ratio=decrease`,
          `pad=${verticalOptions.width}:${verticalOptions.height}:(ow-iw)/2:(oh-ih)/2:${verticalOptions.backgroundColor}`
        ];
      }

      ffmpeg(inputPath)
        .videoFilters(videoFilters)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-preset', 'medium', '-crf', '23'])
        .format('mp4')
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('🚀 Starting vertical conversion...');
          console.log(`FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`📊 Vertical conversion progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log(`✅ Vertical conversion completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error(`❌ Vertical conversion failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Create a copy of a video file for safe testing
   */
  async copyVideo(inputVideoPath, outputVideoPath) {
    console.log(`📋 Creating video copy for testing...`);
    console.log(`📂 From: ${path.basename(inputVideoPath)}`);
    console.log(`📂 To: ${path.basename(outputVideoPath)}`);
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputVideoPath)
        .outputOptions(['-c', 'copy'])  // Copy streams without re-encoding for speed
        .output(outputVideoPath)
        .on('start', (commandLine) => {
          console.log(`FFmpeg copy: ${commandLine}`);
        })
        .on('end', () => {
          console.log(`✅ Video copy completed: ${outputVideoPath}`);
          resolve(outputVideoPath);
        })
        .on('error', (error) => {
          console.error(`❌ Video copy failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Overlay original audio onto a video file
   */
  async overlayOriginalAudio(videoPath, audioPath, outputPath, options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`Overlaying original audio onto video...`);
      
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-c:v', 'copy',  // Copy video stream without re-encoding
          '-c:a', 'aac',   // Re-encode audio to AAC
          '-map', '0:v:0', // Use video from first input (video file)
          '-map', '1:a:0', // Use audio from second input (audio file)
          '-shortest'      // End when shortest input ends
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`FFmpeg audio overlay: ${commandLine}`);
        })
        .on('end', () => {
          console.log(`Audio overlay completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error(`Audio overlay failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Get video information (duration, resolution, format, etc.)
   */
  /**
   * Get video dimensions (width, height)
   */
  async getVideoDimensions(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        
        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }
        
        resolve({
          width: videoStream.width,
          height: videoStream.height,
          aspectRatio: videoStream.width / videoStream.height
        });
      });
    });
  }

  /**
   * Normalize video to match target dimensions
   */
  async normalizeVideoToTarget(inputPath, outputPath, targetWidth, targetHeight) {
    console.log(`📐 Normalizing video to ${targetWidth}x${targetHeight}`);
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters([
          `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
          `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`
        ])
        .outputOptions([
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'medium',
          '-crf', '23'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`FFmpeg normalize: ${commandLine}`);
        })
        .on('end', () => {
          console.log(`✅ Video normalized: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error(`❌ Video normalization failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  async getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (error, metadata) => {
        if (error) {
          reject(error);
        } else {
          const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
          const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');

          resolve({
            duration: parseFloat(metadata.format.duration),
            format: metadata.format.format_name,
            size: parseInt(metadata.format.size),
            bitrate: parseInt(metadata.format.bit_rate),
            video: videoStream ? {
              codec: videoStream.codec_name,
              width: videoStream.width,
              height: videoStream.height,
              fps: eval(videoStream.r_frame_rate), // e.g., "30/1" -> 30
              bitrate: parseInt(videoStream.bit_rate) || null
            } : null,
            audio: audioStream ? {
              codec: audioStream.codec_name,
              sampleRate: parseInt(audioStream.sample_rate),
              channels: audioStream.channels,
              bitrate: parseInt(audioStream.bit_rate) || null
            } : null
          });
        }
      });
    });
  }

  /**
   * Create a preview/thumbnail from video
   */
  async createThumbnail(videoPath, outputPath, options = {}) {
    const timePosition = options.time || '50%'; // Take screenshot at 50% by default
    const size = options.size || '320x180';

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timePosition)
        .frames(1)
        .size(size)
        .format('png')
        .output(outputPath)
        .on('end', () => {
          console.log(`Thumbnail created: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error(`Thumbnail creation failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Validate video file
   */
  async validateVideo(videoPath) {
    try {
      const info = await this.getVideoInfo(videoPath);
      
      const issues = [];
      
      if (!info.video) {
        issues.push('No video stream found');
      }
      
      if (info.duration < 0.1) {
        issues.push('Video too short');
      }
      
      if (info.video && (info.video.width < 100 || info.video.height < 100)) {
        issues.push('Video resolution too low');
      }

      return {
        isValid: issues.length === 0,
        issues,
        info
      };
      
    } catch (error) {
      return {
        isValid: false,
        issues: [`Failed to read video: ${error.message}`],
        info: null
      };
    }
  }

  /**
   * Get video bitrate based on quality setting
   */
  getVideoBitrate(quality) {
    const bitrates = {
      'low': '500k',
      'medium': '1000k',
      'high': '2000k',
      'ultra': '4000k'
    };
    return bitrates[quality] || bitrates['high'];
  }

  /**
   * Get audio bitrate based on quality setting
   */
  getAudioBitrate(quality) {
    const bitrates = {
      'low': '64k',
      'medium': '128k',
      'high': '192k',
      'ultra': '320k'
    };
    return bitrates[quality] || bitrates['high'];
  }

  /**
   * Crop and prepare character image for vertical video
   */
  async cropImageForVertical(inputImagePath, outputImagePath, options = {}) {
    const cropOptions = {
      width: options.width || 1080,
      height: options.height || 1920,
      cropMode: options.cropMode || 'center', // 'center', 'top', 'bottom'
      ...options
    };

    return new Promise((resolve, reject) => {
      // Create a filter that crops the image to vertical aspect ratio
      let cropFilter;
      
      if (cropOptions.cropMode === 'top') {
        cropFilter = `crop=${cropOptions.width}:${cropOptions.height}:0:0`;
      } else if (cropOptions.cropMode === 'bottom') {
        cropFilter = `crop=${cropOptions.width}:${cropOptions.height}:0:ih-${cropOptions.height}`;
      } else {
        // Center crop
        cropFilter = `crop=${cropOptions.width}:${cropOptions.height}:(iw-${cropOptions.width})/2:(ih-${cropOptions.height})/2`;
      }

      ffmpeg(inputImagePath)
        .videoFilter(cropFilter)
        .size(`${cropOptions.width}x${cropOptions.height}`)
        .outputOptions(['-q:v', '2']) // High quality JPEG
        .output(outputImagePath)
        .on('start', (commandLine) => {
          console.log(`Cropping image for vertical: ${path.basename(inputImagePath)}`);
        })
        .on('end', () => {
          console.log(`Image cropped: ${outputImagePath}`);
          resolve(outputImagePath);
        })
        .on('error', (error) => {
          console.error(`Image cropping failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Batch crop multiple character images for vertical format
   */
  async cropCharacterImagesForVertical(characterMatcher, outputDir, options = {}) {
    await fs.ensureDir(outputDir);
    
    const characters = characterMatcher.getCharactersByType('image');
    const croppedImages = {};

    for (const character of characters) {
      try {
        const outputPath = path.join(outputDir, `vertical_${character.filename}`);
        
        await this.cropImageForVertical(
          character.filePath,
          outputPath,
          options
        );
        
        croppedImages[character.name] = {
          ...character,
          filePath: outputPath,
          originalPath: character.filePath,
          cropped: true
        };
        
      } catch (error) {
        console.warn(`Failed to crop ${character.name}: ${error.message}`);
        // Keep original if cropping fails
        croppedImages[character.name] = character;
      }
    }

    return croppedImages;
  }

  /**
   * Add fade transitions between video segments
   */
  async addTransitions(videoPaths, outputPath, options = {}) {
    if (videoPaths.length < 2) {
      throw new Error('Need at least 2 videos for transitions');
    }

    const fadeDuration = options.fadeDuration || 0.5;
    const transitionType = options.transitionType || 'fade';

    // This is a simplified implementation - more complex transitions would require
    // more sophisticated filter graphs
    const filterComplex = [];
    let currentLabel = '';

    for (let i = 0; i < videoPaths.length; i++) {
      if (i === 0) {
        currentLabel = `[0:v]`;
      } else {
        const prevLabel = currentLabel;
        currentLabel = `[v${i}]`;
        
        // Add crossfade between videos
        filterComplex.push(
          `${prevLabel}[${i}:v]xfade=transition=${transitionType}:duration=${fadeDuration}:offset=0${currentLabel}`
        );
      }
    }

    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      
      // Add all input videos
      videoPaths.forEach(videoPath => {
        command.input(videoPath);
      });

      command
        .complexFilter(filterComplex, currentLabel.slice(1, -1))
        .map(currentLabel.slice(1, -1))
        .map('0:a') // Use audio from first video (could be more sophisticated)
        .videoCodec('libx264')
        .audioCodec('aac')
        .format('mp4')
        .output(outputPath)
        .on('end', () => {
          console.log(`Video with transitions created: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error(`Transition creation failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Overlay original audio from one video onto another video
   */
  async overlayOriginalAudioFromVideo(videoPath, audioSourceVideoPath, outputPath) {
    console.log(`🎵 Overlaying original audio from source video...`);
    console.log(`📹 Video: ${path.basename(videoPath)}`);
    console.log(`🎵 Audio source: ${path.basename(audioSourceVideoPath)}`);
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .input(audioSourceVideoPath)
        .outputOptions([
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`FFmpeg audio overlay: ${commandLine}`);
        })
        .on('end', () => {
          console.log(`✅ Audio overlay completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error(`❌ Audio overlay failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Apply meta videos as true overlays at specific timestamps, preserving original timeline
   */
  async applyMetaVideoOverlays(baseVideoPath, metaVideos, outputPath) {
    console.log(`🎬 Applying ${metaVideos.length} meta video overlays with preserved timeline...`);
    
    if (metaVideos.length === 0) {
      // No meta videos to apply, just copy the original
      await this.copyVideo(baseVideoPath, outputPath);
      return outputPath;
    }
    
    return new Promise((resolve, reject) => {
      const command = ffmpeg(baseVideoPath);
      
      // Add each meta video as an input
      metaVideos.forEach(meta => {
        command.input(meta.videoPath);
      });
      
      // Build filter_complex for overlays
      let filterComplex = '[0:v]copy[base]'; // Start with base video
      let currentInput = 'base';
      
      metaVideos.forEach((meta, index) => {
        const inputIndex = index + 1; // +1 because base video is input 0
        const outputLabel = index === metaVideos.length - 1 ? 'final' : `overlay${index}`;
        
        // Create overlay filter: [current][input:v]overlay=enable='between(t,start,end)'[output]
        filterComplex += `;[${currentInput}][${inputIndex}:v]overlay=enable='between(t,${meta.timing.start},${meta.timing.end})'[${outputLabel}]`;
        currentInput = outputLabel;
      });
      
      console.log(`🔧 Filter complex: ${filterComplex}`);
      
      command
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[final]',
          '-map', '0:a', // Keep original audio
          '-c:a', 'aac',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-r', '24',
          '-avoid_negative_ts', 'make_zero',
          '-fflags', '+genpts'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`FFmpeg overlay command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`📊 Meta overlay progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log(`✅ Meta video overlays completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error(`❌ Meta overlay failed: ${error.message}`);
          reject(error);
        })
        .run();
    });
  }
}
