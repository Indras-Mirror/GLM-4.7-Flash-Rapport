# Vision Analysis Skill

You have access to advanced image analysis tools via the `visionproxy` MCP server.

## Available Tools

### 1. `analyze_image`
**Purpose**: Get technical image properties and statistics
**Returns**:
- Dimensions (width, height, total pixels)
- Format (JPEG, PNG, WebP, etc.)
- Color statistics (RGB mean and standard deviation)
- Brightness and contrast measurements
- Aspect ratio

**Use when**: User asks for image specifications, color analysis, or technical properties

**Example**:
```
User: "What are the dimensions and colors of ~/Pictures/photo.jpg?"
You: [Call analyze_image tool with image_path]
```

---

### 2. `detect_faces`
**Purpose**: Detect and analyze faces using OpenCV
**Returns**:
- Number of faces detected
- Face positions (x, y, width, height)
- Face brightness and contrast
- Number of eyes detected per face
- Face center coordinates

**Use when**: User asks about faces, people, or facial features in an image

**Example**:
```
User: "How many faces are in this image?"
You: [Call detect_faces tool with image_path]
```

---

### 3. `get_image_metadata`
**Purpose**: Extract EXIF metadata and file information
**Returns**:
- File info (size, modified timestamp, filename)
- Image info (dimensions, format, mode)
- EXIF data (camera model, settings, ISO, exposure, etc.)
- GPS data (if available)

**Use when**: User asks about camera settings, when photo was taken, or file details

**Example**:
```
User: "What camera was used to take this photo?"
You: [Call get_image_metadata tool with image_path]
```

---

### 4. `describe_image`
**Purpose**: Get natural language description using OpenRouter vision AI
**Returns**: Detailed visual description of image content

**Use when**: User asks "what's in this image?" or wants a general description

**Example**:
```
User: "Describe what's in ~/Downloads/screenshot.png"
You: [Call describe_image tool with image_path and optional prompt]
```

---

## Important Usage Notes

1. **DEFAULT BEHAVIOR - Natural Language First**:
   - **ALWAYS start with `describe_image`** for general image questions
   - Give natural language descriptions, NOT raw JSON
   - Only use technical tools if user explicitly asks for specs/metadata/technical details

2. **Path Handling**:
   - Always expand `~` to full home directory path
   - Accept both absolute and relative paths
   - Verify file exists before calling tools

3. **Tool Selection Priority**:
   - **Primary**: `describe_image` - Use for general "what's in this image?" questions
   - **Secondary (only if requested)**:
     - `analyze_image` - When user asks for dimensions/colors/technical specs
     - `detect_faces` - When user asks for face count/positions
     - `get_image_metadata` - When user asks for camera settings/EXIF

4. **Output Format**:
   - **Convert JSON to natural language** - Don't dump raw JSON unless user asks for it
   - Example: "The image is 1920x1080 pixels with warm tones" NOT `{"width": 1920, "height": 1080}`
   - Only show raw JSON if user explicitly requests "JSON output" or "raw data"

5. **Error Handling**:
   - If image path doesn't exist, inform user and ask for correct path
   - If OpenRouter API key is missing, suggest user set OPENROUTER_API_KEY

---

## Example Workflows

### Complete Image Analysis
```
User: "Give me a complete analysis of ~/Pictures/vacation.jpg"

You should:
1. Call analyze_image → Get dimensions, colors, brightness
2. Call detect_faces → Count people in photo
3. Call get_image_metadata → Get camera info, timestamp
4. Call describe_image → Get visual description
5. Synthesize all results into comprehensive summary
```

### Quick Face Detection
```
User: "Are there any people in ~/Downloads/screenshot.png?"

You should:
1. Call detect_faces → Get face count and positions
2. Summarize: "Found X faces at positions..."
```

### Camera Settings Lookup
```
User: "What ISO was this shot at?"

You should:
1. Call get_image_metadata → Extract EXIF data
2. Look for ISO in EXIF data
3. Report: "ISO 400" or "No ISO data available"
```

---

## Integration with Vision Proxy

**Note**: This skill provides **code-based analysis** tools. For natural language image analysis when you paste an image directly into Claude Code, the vision proxy will automatically route to OpenRouter.

- **Pasted images** → Vision proxy handles automatically
- **File paths** → Use these MCP tools
- **Combination** → Both work together seamlessly

---

## Current Task

The user has invoked the `/vision` skill. Determine what type of analysis they need and use the appropriate tools from the `visionproxy` MCP server.

If no image path was provided, ask the user for the image path.
