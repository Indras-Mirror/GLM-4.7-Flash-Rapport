#!/usr/bin/env python3
"""
Image Routing Proxy for Claude Code
Routes requests containing images to vision-capable backends
Forwards other requests to the original API endpoint

Supports:
- Local llama.cpp (Anthropic API format)
- OpenRouter (OpenAI API format with conversion)
"""

import json
import sys
import os
import argparse
import logging
import base64
import gzip
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request
import urllib.error
import time
from threading import Thread

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='[proxy] %(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ImageRoutingProxy(BaseHTTPRequestHandler):
    # Class variables for configuration
    original_api_url = None
    vision_api_url = None
    vision_api_type = None  # 'local' or 'openrouter'
    openrouter_api_key = None
    openrouter_model = None

    def log_message(self, format, *args):
        """Override to use our logger"""
        logger.info(format % args)

    def has_image_content(self, body_data):
        """Check if request body contains image content blocks"""
        try:
            if isinstance(body_data, bytes):
                body_data = body_data.decode('utf-8')

            data = json.loads(body_data)

            # Check messages for image content
            messages = data.get('messages', [])
            for message in messages:
                content = message.get('content', [])

                # content can be a string or list of content blocks
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get('type') == 'image':
                            logger.info("Image content detected in request")
                            return True

            return False
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON: {e}")
            return False
        except Exception as e:
            logger.warning(f"Error checking for images: {e}")
            return False

    def convert_anthropic_to_openai(self, anthropic_request):
        """Convert Anthropic API request format to OpenAI format"""
        openai_request = {
            "model": self.openrouter_model,
            "messages": []
        }

        # Stream setting
        if "stream" in anthropic_request:
            openai_request["stream"] = anthropic_request["stream"]

        # Max tokens
        if "max_tokens" in anthropic_request:
            openai_request["max_tokens"] = anthropic_request["max_tokens"]

        # Convert messages
        for msg in anthropic_request.get("messages", []):
            openai_msg = {
                "role": msg["role"],
                "content": []
            }

            content = msg.get("content", [])
            if isinstance(content, str):
                openai_msg["content"] = content
            elif isinstance(content, list):
                for block in content:
                    if block.get("type") == "text":
                        openai_msg["content"].append({
                            "type": "text",
                            "text": block.get("text", "")
                        })
                    elif block.get("type") == "image":
                        # Convert Anthropic image format to OpenAI format
                        source = block.get("source", {})
                        media_type = source.get("media_type", "image/png")
                        data = source.get("data", "")

                        # OpenAI/OpenRouter uses data URL format
                        openai_msg["content"].append({
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{data}"
                            }
                        })

                # If no content blocks, use empty string
                if not openai_msg["content"]:
                    openai_msg["content"] = ""

            openai_request["messages"].append(openai_msg)

        return openai_request

    def convert_openai_to_anthropic(self, openai_response):
        """Convert OpenAI API response format to Anthropic format"""
        try:
            openai_data = json.loads(openai_response)

            # Extract the first message
            message = openai_data.get("choices", [{}])[0].get("message", {})
            content = message.get("content", "")

            # Handle both string and list content from OpenAI
            if isinstance(content, list):
                text_content = ""
                for item in content:
                    if item.get("type") == "text":
                        text_content += item.get("text", "")
                content = text_content

            anthropic_response = {
                "id": openai_data.get("id", "msg-%s" % int(time.time())),
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "text",
                        "text": content
                    }
                ],
                "model": openai_data.get("model", self.openrouter_model),
                "stop_reason": message.get("finish_reason", "stop"),
                "stop_sequence": None,
                "usage": {
                    "input_tokens": openai_data.get("usage", {}).get("prompt_tokens", 0),
                    "output_tokens": openai_data.get("usage", {}).get("completion_tokens", 0)
                }
            }

            return json.dumps(anthropic_response).encode('utf-8')

        except Exception as e:
            logger.error(f"Error converting OpenAI response: {e}")
            return openai_response

    def forward_request(self, target_url, method, headers, body, is_openrouter=False):
        """Forward request to target API endpoint"""
        try:
            req = urllib.request.Request(
                target_url,
                data=body,
                headers=headers,
                method=method
            )

            # Don't forward Accept-Encoding - we'll handle compression ourselves
            headers = {k: v for k, v in headers.items() if k.lower() != 'accept-encoding'}

            with urllib.request.urlopen(req, timeout=300) as response:
                response_headers = dict(response.headers)
                response_body = response.read()

                # Check if response is gzipped and decompress if needed
                # (urllib doesn't always auto-decompress, especially when we strip Accept-Encoding)
                if response_body and len(response_body) > 2:
                    # Check for gzip magic bytes (0x1f 0x8b)
                    if response_body[0:2] == b'\x1f\x8b':
                        logger.info("Decompressing gzipped response from %s" % target_url)
                        try:
                            response_body = gzip.decompress(response_body)
                        except Exception as e:
                            logger.error("Gzip decompression failed: %s" % e)

                # Convert response from OpenAI to Anthropic if needed
                if is_openrouter:
                    response_body = self.convert_openai_to_anthropic(response_body)

                # Remove any existing content-length headers (case-insensitive)
                for header in list(response_headers.keys()):
                    if header.lower() == 'content-length':
                        del response_headers[header]

                # Update content-length after any conversions
                response_headers['Content-Length'] = str(len(response_body))

                # Remove content-encoding since we've decompressed
                response_headers.pop('content-encoding', None)
                response_headers.pop('Content-Encoding', None)

                # Send response back to client
                self.send_response(response.status)
                for header, value in response_headers.items():
                    # Skip problematic headers when forwarding
                    if header.lower() not in ['transfer-encoding', 'connection', 'keep-alive']:
                        self.send_header(header, value)
                self.end_headers()
                self.wfile.write(response_body)

                return True
        except urllib.error.HTTPError as e:
            # Forward HTTP errors from the API
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error_body = e.read()
            self.wfile.write(error_body)
            logger.warning(f"API returned error {e.code}")
            return False
        except Exception as e:
            logger.error(f"Error forwarding request: {e}")
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error = json.dumps({"error": str(e)})
            self.wfile.write(error.encode('utf-8'))
            return False

    def do_POST(self):
        """Handle POST requests"""
        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        # Determine which backend to use
        has_image = self.has_image_content(body)

        if has_image and self.vision_api_type == 'openrouter':
            # Use OpenRouter
            target_url = "https://openrouter.ai/api/v1/chat/completions"

            # Convert request to OpenAI format
            anthropic_request = json.loads(body)
            openai_request = self.convert_anthropic_to_openai(anthropic_request)
            body = json.dumps(openai_request).encode('utf-8')

            # Update content-length
            headers = {}
            for header, value in self.headers.items():
                if header.lower() not in ['host', 'connection', 'content-length']:
                    headers[header] = value

            headers['Content-Length'] = len(body)
            headers['Authorization'] = f'Bearer {self.openrouter_api_key}'

            logger.info(f"Routing to OpenRouter backend: {target_url}")
            logger.info(f"Model: {self.openrouter_model}")

            self.forward_request(target_url, 'POST', headers, body, is_openrouter=True)

        elif has_image:
            # Use local vision backend (Anthropic format)
            target_url = self.vision_api_url + self.path
            logger.info(f"Routing to local vision backend: {target_url}")

            headers = {}
            for header, value in self.headers.items():
                if header.lower() not in ['host', 'connection']:
                    headers[header] = value

            self.forward_request(target_url, 'POST', headers, body, is_openrouter=False)

        else:
            # Use original backend
            target_url = self.original_api_url + self.path
            logger.info(f"Routing to original backend: {target_url}")

            headers = {}
            for header, value in self.headers.items():
                if header.lower() not in ['host', 'connection']:
                    headers[header] = value

            self.forward_request(target_url, 'POST', headers, body, is_openrouter=False)

    def do_GET(self):
        """Handle GET requests"""
        base_url = self.original_api_url
        target_url = base_url + self.path
        logger.info(f"GET request to {target_url}")

        # Prepare headers
        headers = {}
        for header, value in self.headers.items():
            if header.lower() not in ['host', 'connection']:
                headers[header] = value

        self.forward_request(target_url, 'GET', headers, None)

    def do_HEAD(self):
        """Handle HEAD requests"""
        base_url = self.original_api_url
        target_url = base_url + self.path
        logger.info(f"HEAD request to {target_url}")

        headers = {}
        for header, value in self.headers.items():
            if header.lower() not in ['host', 'connection']:
                headers[header] = value

        self.forward_request(target_url, 'HEAD', headers, None)

def run_proxy(port, original_api, vision_api, vision_api_type, openrouter_api_key=None, openrouter_model=None):
    """Run the proxy server"""
    ImageRoutingProxy.original_api_url = original_api
    ImageRoutingProxy.vision_api_url = vision_api
    ImageRoutingProxy.vision_api_type = vision_api_type
    ImageRoutingProxy.openrouter_api_key = openrouter_api_key
    ImageRoutingProxy.openrouter_model = openrouter_model

    server_address = ('127.0.0.1', port)
    server = HTTPServer(server_address, ImageRoutingProxy)

    logger.info(f"Starting proxy on port {port}")
    logger.info(f"Original API: {original_api}")
    logger.info(f"Vision API: {vision_api} (type: {vision_api_type})")

    if vision_api_type == 'openrouter':
        logger.info(f"OpenRouter Model: {openrouter_model}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Proxy shutdown requested")
        server.shutdown()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Image routing proxy for Claude Code')
    parser.add_argument('--port', type=int, default=9000, help='Port to listen on')
    parser.add_argument('--original-api', required=True, help='Original API URL')
    parser.add_argument('--vision-api', help='Local vision API URL (for local type)')
    parser.add_argument('--vision-api-type', default='local', choices=['local', 'openrouter'],
                        help='Type of vision backend (local or openrouter)')
    parser.add_argument('--openrouter-api-key', help='OpenRouter API key (or set OPENROUTER_API_KEY env var)')
    parser.add_argument('--openrouter-model', default='z-ai/glm-4.6v', help='OpenRouter model to use')

    args = parser.parse_args()

    # Get API key from args or environment
    openrouter_api_key = args.openrouter_api_key or os.environ.get('OPENROUTER_API_KEY')

    if args.vision_api_type == 'openrouter' and not openrouter_api_key:
        logger.error("OpenRouter API key required (--openrouter-api-key or OPENROUTER_API_KEY env var)")
        sys.exit(1)

    run_proxy(
        args.port,
        args.original_api,
        args.vision_api,
        args.vision_api_type,
        openrouter_api_key,
        args.openrouter_model
    )
