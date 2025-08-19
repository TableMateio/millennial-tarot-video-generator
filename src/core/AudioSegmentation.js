/**
 * AudioSegmentation.js
 * Handles parsing audio files and mapping segments to speakers
 */

export class AudioSegmentation {
  constructor(audioFile, segmentationData) {
    this.audioFile = audioFile;
    this.segments = this.parseSegmentation(segmentationData);
  }

  /**
   * Parse segmentation data - supports multiple formats
   * @param {Object|Array} data - Timestamps, speaker sequence, or other formats
   */
  parseSegmentation(data) {
    if (Array.isArray(data)) {
      // Format: [{ speaker: "The_Empress", start: 0, end: 5.2 }, ...]
      return this.parseTimestampFormat(data);
    } else if (data.type === 'sequence') {
      // Format: { type: 'sequence', speakers: ["The_Empress", "The_Etsy_Queen"], durations: [5.2, 3.1] }
      return this.parseSequenceFormat(data);
    } else if (data.type === 'diarization') {
      // Future: automated speaker detection results
      return this.parseDiarizationFormat(data);
    }
    
    throw new Error('Unsupported segmentation format');
  }

  parseTimestampFormat(segments) {
    return segments.map((segment, index) => {
      // Auto-calculate start time if not provided (use previous end time)
      const startTime = segment.start !== undefined ? segment.start : 
        (index > 0 ? segments[index - 1].end : 0);
      
      return {
        id: `segment_${index}`,
        speaker: segment.speaker || segment.video, // Support both speaker and video keys
        video: segment.video || segment.speaker, // Video file to use
        startTime: startTime,
        endTime: segment.end,
        duration: segment.end - startTime,
        dialogue: segment.dialogue || segment.text || null, // Support dialogue text
        sync: segment.sync !== undefined ? segment.sync : true, // Default to sync unless explicitly false
        type: segment.sync === false ? 'cutaway' : 'dialogue' // Classify segment type
      };
    });
  }

  parseSequenceFormat(data) {
    const segments = [];
    let currentTime = 0;
    
    data.speakers.forEach((speaker, index) => {
      const duration = data.durations[index] || 1.0; // Default 1 second if not specified
      segments.push({
        id: `segment_${index}`,
        speaker: speaker,
        video: data.videos ? data.videos[index] : speaker, // Support separate video mapping
        startTime: currentTime,
        endTime: currentTime + duration,
        duration: duration,
        dialogue: data.dialogue ? data.dialogue[index] : null,
        sync: data.sync ? data.sync[index] : true, // Support per-segment sync setting
        type: (data.sync && data.sync[index] === false) ? 'cutaway' : 'dialogue'
      });
      currentTime += duration;
    });
    
    return segments;
  }

  parseDiarizationFormat(data) {
    // Placeholder for future automated speaker detection
    // Would process AI-generated speaker timestamps
    return data.segments.map((segment, index) => ({
      id: `segment_${index}`,
      speaker: segment.speakerId, // Would need mapping to character names
      startTime: segment.start,
      endTime: segment.end,
      duration: segment.end - segment.start,
      confidence: segment.confidence || 1.0
    }));
  }

  /**
   * Normalize speaker names to match character image file naming convention
   * e.g., "The Empress" -> "The_Empress"
   */
  normalizeSpeakerName(speakerName) {
    return speakerName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  }

  /**
   * Get all segments for processing
   */
  getSegments() {
    return this.segments;
  }

  /**
   * Get segment by ID
   */
  getSegment(id) {
    return this.segments.find(segment => segment.id === id);
  }

  /**
   * Get segments by speaker
   */
  getSegmentsBySpeaker(speaker) {
    const normalizedSpeaker = this.normalizeSpeakerName(speaker);
    return this.segments.filter(segment => segment.speaker === normalizedSpeaker);
  }

  /**
   * Validate that all segments have valid timing
   */
  validate() {
    const errors = [];
    
    for (let i = 0; i < this.segments.length; i++) {
      const segment = this.segments[i];
      
      if (segment.startTime < 0) {
        errors.push(`Segment ${segment.id}: Start time cannot be negative`);
      }
      
      if (segment.endTime <= segment.startTime) {
        errors.push(`Segment ${segment.id}: End time must be after start time`);
      }
      
      if (i > 0 && segment.startTime < this.segments[i-1].endTime) {
        errors.push(`Segment ${segment.id}: Overlaps with previous segment`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
