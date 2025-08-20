/**
 * DropboxUploader.js
 * Service for uploading files to Dropbox and generating temporary shareable links
 * Uses 4-hour expiring links with direct download capability for Sync API
 */

import { Dropbox } from 'dropbox';
import fs from 'fs-extra';
import path from 'path';

import { DropboxOAuth } from './DropboxOAuth.js';

export class DropboxUploader {
  constructor(accessToken) {
    this.staticToken = accessToken;
    this.oauth = new DropboxOAuth(
      process.env.DROPBOX_CLIENT_ID,
      process.env.DROPBOX_CLIENT_SECRET
    );
  }

  /**
   * Get a valid Dropbox client with fresh token
   */
  async getDropboxClient() {
    try {
      // Try OAuth first
      if (process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET) {
        const hasTokens = await this.oauth.hasValidTokens();
        if (hasTokens) {
          const accessToken = await this.oauth.getValidAccessToken();
          return new Dropbox({ accessToken });
        }
      }
      
      // Fall back to static token
      if (this.staticToken) {
        return new Dropbox({ accessToken: this.staticToken });
      }
      
      throw new Error('No valid Dropbox authentication available');
    } catch (error) {
      throw new Error(`Failed to get Dropbox client: ${error.message}`);
    }
  }

  /**
   * Upload temporary files to Dropbox and get shareable links
   * @param {string} localFilePath - Local file path
   * @param {string} dropboxPath - Optional Dropbox path
   * @param {Object} options - Options
   * @returns {Promise<{url: string, filename: string, expires_in: string}>}
   */
  async uploadAndGetShareableLink(localFilePath, dropboxPath = null, options = {}) {
    try {
      const filename = path.basename(localFilePath);
      const uploadPath = dropboxPath || `/sync-temp/${Date.now()}_${filename}`;
      
      console.log(`📤 Uploading to Dropbox: ${filename}`);
      
      // Read file content
      const fileContent = await fs.readFile(localFilePath);
      
      // Get Dropbox client and upload file
      const dbx = await this.getDropboxClient();
      const uploadResponse = await dbx.filesUpload({
        path: uploadPath,
        contents: fileContent,
        mode: 'overwrite',
        autorename: true
      });
      
      console.log(`✅ Upload completed: ${uploadResponse.result.name}`);
      
      // Generate temporary link (expires in 4 hours)
      const tempLinkResponse = await dbx.filesGetTemporaryLink({
        path: uploadResponse.result.path_lower
      });
      
      // Modify URL for direct download (dl=1) - needed for Sync API
      let shareableUrl = tempLinkResponse.result.link;
      if (!shareableUrl.includes('dl=1')) {
        shareableUrl = shareableUrl.includes('?') 
          ? shareableUrl.replace('dl=0', 'dl=1')
          : shareableUrl + '?dl=1';
      }
      
      console.log(`🔗 Temporary link created (expires in 4 hours)`);
      
      return {
        url: shareableUrl,
        filename: filename,
        expires_in: '4 hours',
        dropbox_path: uploadResponse.result.path_lower,
        size: uploadResponse.result.size
      };
      
    } catch (error) {
      console.error(`❌ Dropbox upload failed for ${localFilePath}:`, error.message);
      throw new Error(`Dropbox upload failed: ${error.message}`);
    }
  }

  /**
   * Upload multiple files and get their shareable links
   * @param {string[]} localFilePaths - Array of local file paths
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Map of local paths to upload results
   */
  async uploadMultipleFiles(localFilePaths, options = {}) {
    const results = {};
    
    // Upload files in parallel for speed
    const uploadPromises = localFilePaths.map(async (filePath) => {
      try {
        const result = await this.uploadAndGetShareableLink(filePath, null, options);
        results[filePath] = result;
      } catch (error) {
        results[filePath] = { error: error.message };
      }
    });
    
    await Promise.all(uploadPromises);
    return results;
  }

  /**
   * Clean up uploaded files from Dropbox
   * @param {string[]} dropboxPaths - Array of Dropbox paths to delete
   */
  async cleanupFiles(dropboxPaths) {
    if (!dropboxPaths || dropboxPaths.length === 0) return;
    
    try {
      console.log(`🧹 Cleaning up ${dropboxPaths.length} files from Dropbox...`);
      
      // Delete files in parallel
      const deletePromises = dropboxPaths.map(async (dropboxPath) => {
        try {
          const dbx = await this.getDropboxClient();
          await dbx.filesDeleteV2({ path: dropboxPath });
          console.log(`🗑️  Deleted: ${path.basename(dropboxPath)}`);
        } catch (error) {
          console.warn(`⚠️  Failed to delete ${dropboxPath}:`, error.message);
        }
      });
      
      await Promise.all(deletePromises);
      console.log(`✅ Cleanup completed`);
      
    } catch (error) {
      console.warn('Cleanup failed:', error.message);
    }
  }

  /**
   * Test Dropbox connection
   */
  async testConnection() {
    try {
      const dbx = await this.getDropboxClient();
      const accountInfo = await dbx.usersGetCurrentAccount();
      console.log(`✅ Dropbox connected as: ${accountInfo.result.name.display_name}`);
      return true;
    } catch (error) {
      console.error(`❌ Dropbox connection failed:`, error.message);
      return false;
    }
  }
}
