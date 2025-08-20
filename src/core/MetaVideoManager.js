import fs from 'fs-extra';
import path from 'path';

/**
 * Manages meta-videos like intros, outros, cutaways, and overlays
 * Handles timing, clipping, and integration with the main video generation pipeline
 */
export class MetaVideoManager {
  constructor(config = {}) {
    this.config = {
      metaVideosDirectory: config.metaVideosDirectory || './assets/meta-videos',
      supportedFormats: ['.mp4', '.mov', '.avi', '.mkv'],
      ...config
    };
    
    this.metaVideos = new Map();
  }

  /**
   * Initialize and scan for available meta videos
   */
  async initialize() {
    await this.scanMetaVideos();
    return this;
  }

  /**
   * Scan meta-videos directory and catalog available videos
   */
  async scanMetaVideos() {
    const categories = ['intros', 'outros', 'cutaways', 'overlays'];
    
    for (const category of categories) {
      const categoryPath = path.join(this.config.metaVideosDirectory, category);
      
      if (await fs.pathExists(categoryPath)) {
        const files = await fs.readdir(categoryPath);
        
        for (const file of files) {
          const filePath = path.join(categoryPath, file);
          const stats = await fs.stat(filePath);
          
          if (stats.isFile()) {
            const ext = path.extname(file).toLowerCase();
            
            if (this.config.supportedFormats.includes(ext)) {
              const videoName = path.parse(file).name;
              const key = `${category}:${videoName}`;
              
              this.metaVideos.set(key, {
                name: videoName,
                category: category,
                filename: file,
                filePath: filePath,
                type: 'video'
              });
            }
          }
        }
      }
    }
    
    console.log(`Found ${this.metaVideos.size} meta videos:`, 
      Array.from(this.metaVideos.keys()));
  }

  /**
   * Get meta video by category and name
   */
  getMetaVideo(category, name) {
    // Try exact match first
    let key = `${category}:${name}`;
    let metaVideo = this.metaVideos.get(key);
    
    if (!metaVideo) {
      // Try with pluralized category (intro -> intros, outro -> outros, etc.)
      const pluralCategory = category.endsWith('s') ? category : category + 's';
      key = `${pluralCategory}:${name}`;
      metaVideo = this.metaVideos.get(key);
    }
    
    return metaVideo;
  }

  /**
   * Get all meta videos in a category
   */
  getMetaVideosByCategory(category) {
    return Array.from(this.metaVideos.values()).filter(video => video.category === category);
  }

  /**
   * Process meta video definitions from script
   * Supports timing, clipping, and positioning
   */
  processMetaVideoDefinitions(metaDefinitions, totalDuration) {
    const processedMetas = [];
    
    for (const meta of metaDefinitions) {
      const processed = this.processMetaDefinition(meta, totalDuration);
      if (processed) {
        processedMetas.push(processed);
      }
    }
    
    return processedMetas;
  }

  /**
   * Process a single meta video definition
   */
  processMetaDefinition(meta, totalDuration) {
    const {
      type,           // 'intro', 'outro', 'cutaway', 'overlay'
      name,           // video name
      timing = {},    // timing configuration
      clip = {},      // clipping configuration
      position = 'replace',  // 'replace', 'overlay', 'before', 'after'
      include = true  // whether to include this meta video
    } = meta;

    // Skip if not included
    if (!include) {
      console.log(`Skipping meta video: ${type}:${name} (include: false)`);
      return null;
    }

    // Find the meta video
    const metaVideo = this.getMetaVideo(type, name);
    if (!metaVideo) {
      console.warn(`Meta video not found: ${type}:${name}`);
      return null;
    }

    // Process timing
    const processedTiming = this.processTiming(timing, totalDuration);
    if (!processedTiming) {
      console.warn(`Invalid timing for meta video: ${type}:${name}`);
      return null;
    }

    // Process clipping
    const processedClip = this.processClipping(clip);

    return {
      ...metaVideo,
      videoPath: metaVideo.filePath, // Add videoPath for compatibility
      timing: processedTiming,
      clip: processedClip,
      position: position,
      originalDefinition: meta
    };
  }

  /**
   * Process timing configuration
   */
  processTiming(timing, totalDuration) {
    const {
      start,          // absolute start time
      end,            // absolute end time
      duration,       // duration from start
      fromEnd,        // seconds from end (for outros)
      beforeEnd,      // alias for fromEnd
      offset = 0      // offset adjustment
    } = timing;

    let startTime, endTime;

    if (typeof start !== 'undefined') {
      startTime = start + offset;
      
      if (typeof end !== 'undefined') {
        endTime = end + offset;
      } else if (typeof duration !== 'undefined') {
        endTime = startTime + duration;
      } else {
        // Use entire remaining duration
        endTime = totalDuration;
      }
    } else if (typeof fromEnd !== 'undefined' || typeof beforeEnd !== 'undefined') {
      const secondsFromEnd = fromEnd || beforeEnd;
      endTime = totalDuration + offset;
      startTime = totalDuration - secondsFromEnd + offset;
    } else if (typeof end !== 'undefined') {
      endTime = end + offset;
      
      if (typeof duration !== 'undefined') {
        startTime = endTime - duration;
      } else {
        startTime = 0;
      }
    } else {
      // Default: entire duration
      startTime = 0 + offset;
      endTime = totalDuration + offset;
    }

    // Validate timing
    if (startTime < 0 || endTime <= startTime || endTime > totalDuration + 10) {
      return null;
    }

    return {
      start: startTime,
      end: endTime,
      duration: endTime - startTime
    };
  }

  /**
   * Process clipping configuration
   */
  processClipping(clip) {
    const {
      start = 0,      // start time in source video
      end,            // end time in source video
      duration        // duration from start
    } = clip;

    let clipStart = start;
    let clipEnd = end;

    if (typeof duration !== 'undefined') {
      clipEnd = clipStart + duration;
    }

    return {
      start: clipStart,
      end: clipEnd,
      duration: clipEnd ? clipEnd - clipStart : null
    };
  }

  /**
   * Apply meta videos to the main video timeline
   */
  applyMetaVideos(segments, metaVideos, totalDuration) {
    console.log(`📽️  Applying ${metaVideos.length} meta videos to timeline`);
    
    const timeline = [...segments];
    
    // Sort meta videos by start time
    const sortedMetas = metaVideos.sort((a, b) => a.timing.start - b.timing.start);
    
    for (const meta of sortedMetas) {
      console.log(`🎬 Adding ${meta.category}:${meta.name} at ${meta.timing.start}s-${meta.timing.end}s`);
      
      if (meta.position === 'replace') {
        // Replace segments in the timeline
        this.replaceSegments(timeline, meta);
      } else if (meta.position === 'overlay') {
        // Add as overlay (for future composite support)
        this.addOverlay(timeline, meta);
      } else if (meta.position === 'before') {
        // Insert before main content
        this.insertBefore(timeline, meta);
      } else if (meta.position === 'after') {
        // Insert after main content
        this.insertAfter(timeline, meta);
      }
    }
    
    return timeline;
  }

  /**
   * Replace segments in timeline with meta video
   */
  replaceSegments(timeline, meta) {
    const metaSegment = {
      id: `meta_${meta.category}_${meta.name}_${Date.now()}`,
      type: 'meta',
      metaType: meta.category,
      video: meta.name,
      start: meta.timing.start,
      end: meta.timing.end,
      duration: meta.timing.duration,
      videoPath: meta.filePath,
      clip: meta.clip,
      sync: false, // Meta videos don't need lip-sync
      dialogue: `[${meta.category.toUpperCase()}]`
    };

    // Remove overlapping segments and insert meta segment
    const filteredTimeline = timeline.filter(segment => 
      segment.end <= meta.timing.start || segment.start >= meta.timing.end
    );
    
    filteredTimeline.push(metaSegment);
    
    // Replace timeline with filtered version
    timeline.length = 0;
    timeline.push(...filteredTimeline.sort((a, b) => a.start - b.start));
  }

  /**
   * Add overlay meta video (for future composite support)
   */
  addOverlay(timeline, meta) {
    // For now, add as a regular segment marked as overlay
    const overlaySegment = {
      id: `overlay_${meta.name}_${Date.now()}`,
      type: 'overlay',
      metaType: 'overlay',
      video: meta.name,
      start: meta.timing.start,
      end: meta.timing.end,
      duration: meta.timing.duration,
      videoPath: meta.filePath,
      clip: meta.clip,
      sync: false,
      dialogue: `[OVERLAY: ${meta.name}]`
    };

    timeline.push(overlaySegment);
  }

  /**
   * Insert meta video before main content
   */
  insertBefore(timeline, meta) {
    // Shift all existing segments by meta duration
    const shiftAmount = meta.timing.duration;
    
    timeline.forEach(segment => {
      segment.start += shiftAmount;
      segment.end += shiftAmount;
    });

    // Add meta segment at the beginning
    const metaSegment = {
      id: `intro_${meta.name}_${Date.now()}`,
      type: 'meta',
      metaType: 'intro',
      video: meta.name,
      start: 0,
      end: meta.timing.duration,
      duration: meta.timing.duration,
      videoPath: meta.filePath,
      clip: meta.clip,
      sync: false,
      dialogue: `[INTRO]`
    };

    timeline.unshift(metaSegment);
  }

  /**
   * Insert meta video after main content
   */
  insertAfter(timeline, meta) {
    const metaSegment = {
      id: `outro_${meta.name}_${Date.now()}`,
      type: 'meta',
      metaType: 'outro',
      video: meta.name,
      start: meta.timing.start,
      end: meta.timing.end,
      duration: meta.timing.duration,
      videoPath: meta.filePath,
      clip: meta.clip,
      sync: false,
      dialogue: `[OUTRO]`
    };

    timeline.push(metaSegment);
  }

  /**
   * Get available meta videos summary
   */
  getMetaVideosSummary() {
    const summary = {
      intros: this.getMetaVideosByCategory('intros'),
      outros: this.getMetaVideosByCategory('outros'),
      cutaways: this.getMetaVideosByCategory('cutaways'),
      overlays: this.getMetaVideosByCategory('overlays'),
      total: this.metaVideos.size
    };

    return summary;
  }
}
