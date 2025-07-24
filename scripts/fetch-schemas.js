#!/usr/bin/env node

/**
 * Dynamic Schema Fetcher for GGScout Helm Charts
 * 
 * This script fetches JSON schemas from the remote ggscout repository
 * instead of maintaining local copies. Supports version-specific fetching.
 * 
 * Usage:
 *   node scripts/fetch-schemas.js [version]
 *   
 * Examples:
 *   node scripts/fetch-schemas.js latest
 *   node scripts/fetch-schemas.js v0.17.5
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const SCHEMA_BASE_URL = 'https://ggscout-repository.gitguardian.com/ggscout';
const SCHEMA_FILES = [
  'inventory-config.schema.json',
  'inventory-log-level.schema.json', 
  'jobs.schema.json'
];

const CACHE_DIR = '.cache/schemas';
const DEFAULT_VERSION = 'latest';

/**
 * Ensure directory exists, creating it if necessary
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

/**
 * Download a file from URL to local path
 */
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    
    const request = https.get(url, (response) => {
      if (response.statusCode === 200) {
        const fileStream = fs.createWriteStream(outputPath);
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`✓ Downloaded: ${path.basename(outputPath)}`);
          resolve();
        });
        
        fileStream.on('error', (err) => {
          fs.unlink(outputPath, () => {}); // Delete partial file
          reject(new Error(`File write error: ${err.message}`));
        });
      } else if (response.statusCode === 404) {
        reject(new Error(`Schema not found (404): ${url}`));
      } else {
        reject(new Error(`HTTP ${response.statusCode}: ${url}`));
      }
    });
    
    request.on('error', (err) => {
      reject(new Error(`Network error: ${err.message}`));
    });
    
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error(`Download timeout: ${url}`));
    });
  });
}

/**
 * Validate that a downloaded file is valid JSON schema
 */
function validateSchema(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const schema = JSON.parse(content);
    
    // Basic schema validation
    if (!schema.$schema && !schema.type) {
      throw new Error('Invalid schema: missing $schema or type property');
    }
    
    console.log(`✓ Validated: ${path.basename(filePath)}`);
    return true;
  } catch (error) {
    console.error(`✗ Schema validation failed for ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Check if cached schemas exist and are valid for a version
 */
function getCachedSchemas(version) {
  const versionCacheDir = path.join(CACHE_DIR, version);
  
  if (!fs.existsSync(versionCacheDir)) {
    return null;
  }
  
  // Check if all required schemas exist and are valid
  for (const schemaFile of SCHEMA_FILES) {
    const cachedPath = path.join(versionCacheDir, schemaFile);
    if (!fs.existsSync(cachedPath) || !validateSchema(cachedPath)) {
      return null;
    }
  }
  
  console.log(`✓ Found valid cached schemas for version: ${version}`);
  return versionCacheDir;
}

/**
 * Copy local schemas as fallback when remote fetch fails
 */
function copyLocalSchemas(version) {
  const localSchemasDir = 'schemas';
  const versionCacheDir = path.join(CACHE_DIR, version);
  
  if (!fs.existsSync(localSchemasDir)) {
    throw new Error('No local schemas directory found and remote fetch failed');
  }
  
  console.log(`Copying local schemas as fallback for version: ${version}`);
  ensureDirectoryExists(versionCacheDir);
  
  for (const schemaFile of SCHEMA_FILES) {
    const localPath = path.join(localSchemasDir, schemaFile);
    const cachedPath = path.join(versionCacheDir, schemaFile);
    
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local schema file not found: ${localPath}`);
    }
    
    fs.copyFileSync(localPath, cachedPath);
    console.log(`✓ Copied: ${schemaFile}`);
    
    // Validate the copied schema
    if (!validateSchema(cachedPath)) {
      throw new Error(`Local schema validation failed for ${schemaFile}`);
    }
  }
  
  console.log(`✓ Successfully copied local schemas to: ${versionCacheDir}`);
  return versionCacheDir;
}

/**
 * Fetch schemas for a specific version
 */
async function fetchSchemas(version = DEFAULT_VERSION) {
  console.log(`Fetching schemas for GGScout version: ${version}`);
  
  // Check cache first
  const cachedDir = getCachedSchemas(version);
  if (cachedDir) {
    console.log(`Using cached schemas from: ${cachedDir}`);
    return cachedDir;
  }
  
  // Create version-specific cache directory
  const versionCacheDir = path.join(CACHE_DIR, version);
  ensureDirectoryExists(versionCacheDir);
  
  // Download all schemas
  const downloadPromises = SCHEMA_FILES.map(async (schemaFile) => {
    const url = `${SCHEMA_BASE_URL}/${version}/schemas/${schemaFile}`;
    const outputPath = path.join(versionCacheDir, schemaFile);
    
    try {
      await downloadFile(url, outputPath);
      
      // Validate the downloaded schema
      if (!validateSchema(outputPath)) {
        throw new Error(`Schema validation failed for ${schemaFile}`);
      }
      
      return outputPath;
    } catch (error) {
      console.error(`Failed to fetch ${schemaFile}: ${error.message}`);
      throw error;
    }
  });
  
  try {
    await Promise.all(downloadPromises);
    console.log(`✓ Successfully fetched all schemas for version: ${version}`);
    console.log(`Cached in: ${versionCacheDir}`);
    return versionCacheDir;
  } catch (error) {
    // Clean up partial downloads
    if (fs.existsSync(versionCacheDir)) {
      fs.rmSync(versionCacheDir, { recursive: true, force: true });
    }
    
    // Try fallback to local schemas
    console.log('\n⚠️  Remote schema fetch failed, attempting to use local schemas as fallback...');
    try {
      return copyLocalSchemas(version);
    } catch (fallbackError) {
      console.error(`Fallback to local schemas failed: ${fallbackError.message}`);
      throw new Error(`Both remote fetch and local fallback failed. Remote error: ${error.message}`);
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const version = process.argv[2] || DEFAULT_VERSION;
  
  console.log('GGScout Schema Fetcher');
  console.log('======================');
  
  try {
    const schemaDir = await fetchSchemas(version);
    
    console.log('\nSchema files available:');
    SCHEMA_FILES.forEach(file => {
      const filePath = path.join(schemaDir, file);
      if (fs.existsSync(filePath)) {
        console.log(`  ✓ ${file}`);
      } else {
        console.log(`  ✗ ${file} (missing)`);
      }
    });
    
    console.log(`\nSchemas ready at: ${schemaDir}`);
    console.log('You can now run: mise run bundle-schemas');
    
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    
    // Provide helpful suggestions
    if (error.message.includes('404')) {
      console.error('\nSuggestions:');
      console.error('- Check if the version exists in the remote repository');
      console.error('- Try using "latest" instead of a specific version');
      console.error('- Verify the ggscout-repository URL is accessible');
    } else if (error.message.includes('Network error')) {
      console.error('\nSuggestions:');
      console.error('- Check your internet connection');
      console.error('- Verify the ggscout-repository.gitguardian.com is accessible');
      console.error('- Try again in a few minutes');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { fetchSchemas, validateSchema };