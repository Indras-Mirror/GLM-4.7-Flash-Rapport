#!/usr/bin/env node

/**
 * Vision Proxy MCP Server
 * Provides image analysis tools for Claude Code
 *
 * Tools:
 * - analyze_image: Basic image analysis (dimensions, colors, format)
 * - detect_faces: Face detection and analysis
 * - get_image_metadata: Extract EXIF and file metadata
 * - describe_image: Natural language description via OpenRouter
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// OpenRouter configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'z-ai/glm-4.6v';

class VisionProxyServer {
  constructor() {
    this.server = new Server(
      {
        name: 'vision-proxy',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.error = console.error.bind(console);
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyze_image',
          description: 'Analyze image file: dimensions, format, colors, brightness. Returns technical image properties.',
          inputSchema: {
            type: 'object',
            properties: {
              image_path: {
                type: 'string',
                description: 'Absolute path to the image file',
              },
            },
            required: ['image_path'],
          },
        },
        {
          name: 'detect_faces',
          description: 'Detect and analyze faces in an image using OpenCV. Returns face count, positions, and facial feature analysis.',
          inputSchema: {
            type: 'object',
            properties: {
              image_path: {
                type: 'string',
                description: 'Absolute path to the image file',
              },
            },
            required: ['image_path'],
          },
        },
        {
          name: 'get_image_metadata',
          description: 'Extract EXIF metadata and file information from an image. Returns camera settings, timestamps, GPS data if available.',
          inputSchema: {
            type: 'object',
            properties: {
              image_path: {
                type: 'string',
                description: 'Absolute path to the image file',
              },
            },
            required: ['image_path'],
          },
        },
        {
          name: 'describe_image',
          description: 'Get natural language description of an image using OpenRouter vision API. Returns detailed visual description.',
          inputSchema: {
            type: 'object',
            properties: {
              image_path: {
                type: 'string',
                description: 'Absolute path to the image file',
              },
              prompt: {
                type: 'string',
                description: 'Optional prompt to guide the description (default: "Describe this image in detail")',
              },
            },
            required: ['image_path'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'analyze_image':
            return await this.analyzeImage(args.image_path);
          case 'detect_faces':
            return await this.detectFaces(args.image_path);
          case 'get_image_metadata':
            return await this.getImageMetadata(args.image_path);
          case 'describe_image':
            return await this.describeImage(args.image_path, args.prompt);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Run Python analysis script
   */
  async runPythonScript(scriptName, imagePath) {
    return new Promise((resolve, reject) => {
      const scriptPath = join(__dirname, 'scripts', scriptName);
      const python = spawn('python3', [scriptPath, imagePath]);

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script failed: ${stderr}`));
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            reject(new Error(`Failed to parse Python output: ${stdout}`));
          }
        }
      });
    });
  }

  /**
   * Analyze image - basic properties
   */
  async analyzeImage(imagePath) {
    const expandedPath = this.expandPath(imagePath);
    if (!existsSync(expandedPath)) {
      throw new Error(`Image file not found: ${expandedPath}`);
    }

    const result = await this.runPythonScript('analyze_image.py', expandedPath);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Detect faces in image
   */
  async detectFaces(imagePath) {
    const expandedPath = this.expandPath(imagePath);
    if (!existsSync(expandedPath)) {
      throw new Error(`Image file not found: ${expandedPath}`);
    }

    const result = await this.runPythonScript('detect_faces.py', expandedPath);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Get image metadata
   */
  async getImageMetadata(imagePath) {
    const expandedPath = this.expandPath(imagePath);
    if (!existsSync(expandedPath)) {
      throw new Error(`Image file not found: ${expandedPath}`);
    }

    const result = await this.runPythonScript('get_metadata.py', expandedPath);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Describe image using OpenRouter
   */
  async describeImage(imagePath, prompt = 'Describe this image in detail') {
    const expandedPath = this.expandPath(imagePath);
    if (!existsSync(expandedPath)) {
      throw new Error(`Image file not found: ${expandedPath}`);
    }

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY environment variable not set');
    }

    // Read and encode image
    const imageBuffer = readFileSync(expandedPath);
    const base64Image = imageBuffer.toString('base64');

    // Detect image type
    let mediaType = 'image/jpeg';
    if (expandedPath.toLowerCase().endsWith('.png')) {
      mediaType = 'image/png';
    } else if (expandedPath.toLowerCase().endsWith('.webp')) {
      mediaType = 'image/webp';
    } else if (expandedPath.toLowerCase().endsWith('.gif')) {
      mediaType = 'image/gif';
    }

    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mediaType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const description = data.choices[0]?.message?.content || 'No description available';

    return {
      content: [
        {
          type: 'text',
          text: description,
        },
      ],
    };
  }

  /**
   * Expand ~ in paths
   */
  expandPath(path) {
    if (path.startsWith('~')) {
      return join(process.env.HOME, path.slice(1));
    }
    return resolve(path);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.error('Vision Proxy MCP Server running on stdio');
  }
}

const server = new VisionProxyServer();
server.run().catch(console.error);
