#!/usr/bin/env python3
"""
Basic image analysis script
Returns: dimensions, format, color statistics, brightness
"""

import sys
import json
from PIL import Image
import numpy as np

def analyze_image(image_path):
    try:
        # Open image
        img = Image.open(image_path)

        # Convert to RGB if needed
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGB')

        # Get basic info
        width, height = img.size
        format_name = img.format or 'Unknown'
        mode = img.mode

        # Convert to numpy array for analysis
        img_array = np.array(img)

        # Color statistics
        if mode in ('RGB', 'RGBA'):
            r_mean = float(np.mean(img_array[:, :, 0]))
            g_mean = float(np.mean(img_array[:, :, 1]))
            b_mean = float(np.mean(img_array[:, :, 2]))

            r_std = float(np.std(img_array[:, :, 0]))
            g_std = float(np.std(img_array[:, :, 1]))
            b_std = float(np.std(img_array[:, :, 2]))
        else:
            r_mean = g_mean = b_mean = float(np.mean(img_array))
            r_std = g_std = b_std = float(np.std(img_array))

        # Overall brightness
        brightness = (r_mean + g_mean + b_mean) / 3

        # Contrast (standard deviation)
        contrast = (r_std + g_std + b_std) / 3

        result = {
            "success": True,
            "dimensions": {
                "width": width,
                "height": height,
                "total_pixels": width * height
            },
            "format": format_name,
            "mode": mode,
            "color_statistics": {
                "red": {
                    "mean": round(r_mean, 2),
                    "std": round(r_std, 2)
                },
                "green": {
                    "mean": round(g_mean, 2),
                    "std": round(g_std, 2)
                },
                "blue": {
                    "mean": round(b_mean, 2),
                    "std": round(b_std, 2)
                }
            },
            "brightness": round(brightness, 2),
            "contrast": round(contrast, 2),
            "aspect_ratio": round(width / height, 2)
        }

        print(json.dumps(result))

    except Exception as e:
        result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(result))
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No image path provided"}))
        sys.exit(1)

    analyze_image(sys.argv[1])
