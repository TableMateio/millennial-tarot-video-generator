/**
 * CharacterMatcher.js
 * Handles matching speakers to character images/videos based on naming conventions
 */

import fs from 'fs-extra';
import path from 'path';

export class CharacterMatcher {
  constructor(charactersDirectory) {
    this.charactersDirectory = charactersDirectory;
    this.characterMap = new Map();
    this.supportedFormats = ['.mp4', '.mov', '.avi', '.webm', '.png', '.jpg', '.jpeg'];
    this.preferredFormats = ['.mp4', '.mov']; // Video files preferred for Sync API
  }

  /**
   * Initialize by scanning the characters directory
   */
  async initialize() {
    if (!await fs.pathExists(this.charactersDirectory)) {
      throw new Error(`Characters directory not found: ${this.charactersDirectory}`);
    }

    await this.scanCharacterDirectory();
    return this;
  }

  /**
   * Scan directory for character files and build mapping
   */
  async scanCharacterDirectory() {
    const files = await fs.readdir(this.charactersDirectory);
    
    for (const file of files) {
      const filePath = path.join(this.charactersDirectory, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        const ext = path.extname(file).toLowerCase();
        
        if (this.supportedFormats.includes(ext)) {
          const characterName = this.extractCharacterName(file);
          
          // Store both the original filename and full path
          this.characterMap.set(characterName, {
            name: characterName,
            filename: file,
            filePath: filePath,
            fileType: this.getFileType(ext),
            extension: ext
          });
        }
      }
    }

    console.log(`Found ${this.characterMap.size} character files:`, 
      Array.from(this.characterMap.keys()));
  }

  /**
   * Extract character name from filename
   * e.g., "The_Empress.png" -> "The_Empress"
   * e.g., "The Etsy Queen - v2.png" -> "The_Etsy_Queen"
   */
  extractCharacterName(filename) {
    // Remove extension
    const nameWithoutExt = path.parse(filename).name;
    
    // Handle various naming patterns
    let characterName = nameWithoutExt
      .replace(/\s*-\s*v\d+$/, '')  // Remove version suffixes like "- v2", "-v1" (but not standalone numbers)
      .replace(/\s*\(.*?\)$/, '')   // Remove parenthetical suffixes
      .replace(/\s+/g, '_')         // Convert spaces to underscores
      .replace(/[^a-zA-Z0-9_]/g, '') // Remove special characters except underscores
      .replace(/_+/g, '_')          // Collapse multiple underscores
      .replace(/^_|_$/g, '');       // Remove leading/trailing underscores

    return characterName;
  }

  /**
   * Determine if file is image or video
   */
  getFileType(extension) {
    const videoExts = ['.mp4', '.mov', '.avi', '.webm'];
    return videoExts.includes(extension) ? 'video' : 'image';
  }

  /**
   * Find character file for a given speaker/video name
   */
  findCharacter(nameOrVideo) {
    const normalizedName = this.normalizeString(nameOrVideo);
    
    // Direct match first
    if (this.characterMap.has(normalizedName)) {
      return this.characterMap.get(normalizedName);
    }

    // Try fuzzy matching for common variations
    for (const [characterName, characterData] of this.characterMap) {
      if (this.isFuzzyMatch(normalizedName, characterName)) {
        return characterData;
      }
    }

    return null;
  }

  /**
   * Find character by video filename (supports multiple videos per character)
   */
  findCharacterByVideo(videoName) {
    // Remove extension and normalize
    const baseName = videoName.replace(/\.(mp4|mov|avi|webm)$/i, '');
    return this.findCharacter(baseName);
  }

  /**
   * Normalize string for comparison
   */
  normalizeString(str) {
    return str
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Check if two names are similar enough to be considered a match
   */
  isFuzzyMatch(speaker, character) {
    const speakerNorm = this.normalizeString(speaker);
    const characterNorm = this.normalizeString(character);

    // Exact match
    if (speakerNorm === characterNorm) return true;

    // Check if one contains the other
    if (speakerNorm.includes(characterNorm) || characterNorm.includes(speakerNorm)) {
      return true;
    }

    // Check common abbreviations/variations
    const variations = this.getNameVariations(characterNorm);
    return variations.includes(speakerNorm);
  }

  /**
   * Generate common variations of a character name
   */
  getNameVariations(characterName) {
    const variations = [characterName];
    
    // Remove "the" prefix
    if (characterName.startsWith('the_')) {
      variations.push(characterName.substring(4));
    }
    
    // Add "the" prefix if not present
    if (!characterName.startsWith('the_')) {
      variations.push('the_' + characterName);
    }

    // Handle common abbreviations
    const abbreviations = {
      'etsy_queen': ['etsy', 'queen'],
      'high_priestess': ['priestess', 'hp'],
      'fool': ['the_fool']
    };

    for (const [full, abbrevs] of Object.entries(abbreviations)) {
      if (characterName.includes(full)) {
        variations.push(...abbrevs);
      }
    }

    return variations;
  }

  /**
   * Get all available characters
   */
  getAvailableCharacters() {
    return Array.from(this.characterMap.values());
  }

  /**
   * Get characters by type (image/video)
   */
  getCharactersByType(type) {
    return Array.from(this.characterMap.values())
      .filter(char => char.fileType === type);
  }

  /**
   * Validate that all required speakers have matching characters
   */
  validateSpeakerMapping(speakers) {
    const results = {
      valid: true,
      matches: {},
      missing: []
    };

    for (const speaker of speakers) {
      const character = this.findCharacter(speaker);
      if (character) {
        results.matches[speaker] = character;
      } else {
        results.missing.push(speaker);
        results.valid = false;
      }
    }

    return results;
  }

  /**
   * Suggest character matches for unmatched speakers
   */
  suggestMatches(speakerName) {
    const allCharacters = this.getAvailableCharacters();
    const suggestions = [];

    for (const character of allCharacters) {
      const similarity = this.calculateSimilarity(speakerName, character.name);
      if (similarity > 0.3) { // Threshold for suggestions
        suggestions.push({
          character: character.name,
          similarity,
          filePath: character.filePath
        });
      }
    }

    return suggestions.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate string similarity (simple Levenshtein-based)
   */
  calculateSimilarity(str1, str2) {
    const s1 = this.normalizeString(str1);
    const s2 = this.normalizeString(str2);
    
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = this.levenshteinDistance(s1, s2);
    return (maxLength - distance) / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = Array(str2.length + 1).fill(null).map(() => 
      Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}
