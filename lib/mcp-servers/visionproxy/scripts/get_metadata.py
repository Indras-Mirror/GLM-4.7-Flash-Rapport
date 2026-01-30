#!/usr/bin/env python3
"""
Image metadata extraction script
Returns: EXIF data, file info, camera settings
"""

import sys
import json
import os
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS

def get_metadata(image_path):
    try:
        # Get file info
        file_stat = os.stat(image_path)
        file_size = file_stat.st_size
        modified_time = file_stat.st_mtime

        # Open image
        img = Image.open(image_path)

        # Basic image info
        width, height = img.size
        format_name = img.format or 'Unknown'
        mode = img.mode

        # Extract EXIF data
        exif_data = {}
        gps_data = {}

        try:
            exif = img._getexif()
            if exif:
                for tag_id, value in exif.items():
                    tag = TAGS.get(tag_id, tag_id)

                    # Handle GPS data separately
                    if tag == 'GPSInfo':
                        for gps_tag_id, gps_value in value.items():
                            gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                            gps_data[gps_tag] = str(gps_value)
                    else:
                        # Convert value to string for JSON serialization
                        exif_data[tag] = str(value)
        except AttributeError:
            # No EXIF data available
            pass

        result = {
            "success": True,
            "file_info": {
                "path": image_path,
                "filename": os.path.basename(image_path),
                "size_bytes": file_size,
                "size_mb": round(file_size / (1024 * 1024), 2),
                "modified_timestamp": modified_time
            },
            "image_info": {
                "width": width,
                "height": height,
                "format": format_name,
                "mode": mode,
                "total_pixels": width * height
            },
            "exif": exif_data,
            "gps": gps_data
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

    get_metadata(sys.argv[1])
