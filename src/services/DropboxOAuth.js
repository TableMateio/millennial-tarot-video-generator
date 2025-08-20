import { Dropbox } from 'dropbox';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DropboxOAuth {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = 'https://localhost';
    this.tokenPath = path.join(process.cwd(), '.dropbox-tokens.json');
    
    this.dbx = new Dropbox({
      clientId: this.clientId,
      clientSecret: this.clientSecret
    });
  }

  /**
   * Get the authorization URL for OAuth flow
   */
  getAuthUrl() {
    // Manually construct the OAuth URL since the SDK doesn't provide this method
    const baseUrl = 'https://www.dropbox.com/oauth2/authorize';
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'files.content.write files.content.read sharing.write'
    });
    
    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(authorizationCode) {
    try {
      // Use direct HTTP call since SDK method might not exist
      const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          code: authorizationCode,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
          client_id: this.clientId,
          client_secret: this.clientSecret
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      const tokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
        token_type: data.token_type
      };

      // Save tokens to file
      await this.saveTokens(tokens);
      
      return tokens;
    } catch (error) {
      throw new Error(`Failed to exchange code for token: ${error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken) {
    try {
      const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      const tokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken, // Use new refresh token if provided
        expires_at: Date.now() + (data.expires_in * 1000),
        token_type: data.token_type
      };

      await this.saveTokens(tokens);
      return tokens;
    } catch (error) {
      throw new Error(`Failed to refresh token: ${error.message}`);
    }
  }

  /**
   * Get a valid access token (refresh if needed)
   */
  async getValidAccessToken() {
    try {
      const tokens = await this.loadTokens();
      
      if (!tokens) {
        throw new Error('No tokens found. Please authenticate first.');
      }

      // Check if token is expired (with 5 minute buffer)
      const isExpired = Date.now() > (tokens.expires_at - 5 * 60 * 1000);
      
      if (isExpired && tokens.refresh_token) {
        console.log('🔄 Access token expired, refreshing...');
        const newTokens = await this.refreshAccessToken(tokens.refresh_token);
        return newTokens.access_token;
      }

      return tokens.access_token;
    } catch (error) {
      throw new Error(`Failed to get valid access token: ${error.message}`);
    }
  }

  /**
   * Save tokens to file
   */
  async saveTokens(tokens) {
    try {
      await fs.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2));
      console.log('✅ Tokens saved successfully');
    } catch (error) {
      throw new Error(`Failed to save tokens: ${error.message}`);
    }
  }

  /**
   * Load tokens from file
   */
  async loadTokens() {
    try {
      if (await fs.pathExists(this.tokenPath)) {
        const tokenData = await fs.readFile(this.tokenPath, 'utf8');
        return JSON.parse(tokenData);
      }
      return null;
    } catch (error) {
      throw new Error(`Failed to load tokens: ${error.message}`);
    }
  }

  /**
   * Check if we have valid tokens
   */
  async hasValidTokens() {
    try {
      const tokens = await this.loadTokens();
      if (!tokens) return false;
      
      // Check if token is expired
      const isExpired = Date.now() > tokens.expires_at;
      return !isExpired || !!tokens.refresh_token;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear stored tokens
   */
  async clearTokens() {
    try {
      if (await fs.pathExists(this.tokenPath)) {
        await fs.remove(this.tokenPath);
        console.log('✅ Tokens cleared');
      }
    } catch (error) {
      throw new Error(`Failed to clear tokens: ${error.message}`);
    }
  }
}
