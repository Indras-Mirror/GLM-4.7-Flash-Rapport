#!/usr/bin/env python3
"""
Face detection script using OpenCV
Returns: face count, positions, sizes, facial features
"""

import sys
import json
import cv2
import numpy as np

def detect_faces(image_path):
    try:
        # Load image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not load image: {image_path}")

        # Convert to grayscale for face detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Load Haar cascade for face detection
        face_cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        face_cascade = cv2.CascadeClassifier(face_cascade_path)

        # Detect faces
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30)
        )

        # Analyze each face
        face_data = []
        for i, (x, y, w, h) in enumerate(faces):
            # Extract face region
            face_roi = img[y:y+h, x:x+w]
            face_gray = gray[y:y+h, x:x+w]

            # Calculate face brightness
            face_brightness = float(np.mean(face_gray))

            # Calculate face contrast
            face_contrast = float(np.std(face_gray))

            # Detect eyes in face
            eye_cascade_path = cv2.data.haarcascades + 'haarcascade_eye.xml'
            eye_cascade = cv2.CascadeClassifier(eye_cascade_path)
            eyes = eye_cascade.detectMultiScale(face_gray)

            face_info = {
                "face_id": i + 1,
                "position": {
                    "x": int(x),
                    "y": int(y),
                    "width": int(w),
                    "height": int(h)
                },
                "brightness": round(face_brightness, 2),
                "contrast": round(face_contrast, 2),
                "eyes_detected": len(eyes),
                "center": {
                    "x": int(x + w // 2),
                    "y": int(y + h // 2)
                }
            }

            face_data.append(face_info)

        result = {
            "success": True,
            "face_count": len(faces),
            "image_size": {
                "width": img.shape[1],
                "height": img.shape[0]
            },
            "faces": face_data
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

    detect_faces(sys.argv[1])
