#!/bin/bash
# ============================================================================
# BASE WRAPPER FRAMEWORK FOR CLAUDE CODE
# ============================================================================
# Common functionality for all Claude Code wrappers
# Features:
# - Conversation history separation
# - Image routing
# - Clean exit handling
# - Service management
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Wrapper information (override in child scripts)
WRAPPER_NAME="${WRAPPER_NAME:-unknown}"
WRAPPER_VERSION="${WRAPPER_VERSION:-1.0}"
WRAPPER_DESCRIPTION="${WRAPPER_DESCRIPTION:-Claude Code wrapper}"

# Default paths (can be overridden)
WRAPPERS_DIR="$HOME/AI/Wrappers"
DATA_BASE_DIR="$HOME/.claude-data"
WRAPPER_DATA_DIR="$DATA_BASE_DIR/$WRAPPER_NAME"
LOG_DIR="$WRAPPER_DATA_DIR/logs"
CONFIG_DIR="$WRAPPERS_DIR/config"

# Logging functions
log_info() {
    echo -e "${BLUE}[$WRAPPER_NAME]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[$WRAPPER_NAME]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[$WRAPPER_NAME]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[$WRAPPER_NAME]${NC} $1" >&2
}

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${MAGENTA}[$WRAPPER_NAME DEBUG]${NC} $1" >&2
    fi
}

# Initialize wrapper data directory
init_wrapper_data() {
    mkdir -p "$WRAPPER_DATA_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$CONFIG_DIR"

    # Create wrapper info file
    cat > "$WRAPPER_DATA_DIR/wrapper-info.json" << EOF
{
    "name": "$WRAPPER_NAME",
    "version": "$WRAPPER_VERSION",
    "description": "$WRAPPER_DESCRIPTION",
    "created": "$(date -Iseconds)",
    "data_dir": "$WRAPPER_DATA_DIR"
}
EOF

    log_debug "Initialized data directory: $WRAPPER_DATA_DIR"
}

# Process arguments - translate --skip to --dangerously-skip-permissions
process_arguments() {
    local args=()
    local skip_translated=false
    local image_files=()
    local ralph_mode=false
    local ralph_max_iterations=50
    local ralph_completion_promise=""

    for arg in "$@"; do
        if [[ "$arg" == "--skip" ]]; then
            args+=("--dangerously-skip-permissions")
            skip_translated=true
        elif [[ "$arg" == "--ralph" ]] || [[ "$arg" == "-r" ]]; then
            ralph_mode=true
        elif [[ "$arg" == --ralph-max=* ]]; then
            ralph_max_iterations="${arg#--ralph-max=}"
        elif [[ "$arg" == --ralph-promise=* ]]; then
            ralph_completion_promise="${arg#--ralph-promise=}"
        elif [[ "$arg" =~ \.(jpg|jpeg|png|gif|webp|bmp|tiff|JPG|JPEG|PNG|GIF|WEBP|BMP|TIFF)$ ]]; then
            # Track image files for routing
            image_files+=("$arg")
            args+=("$arg")
        else
            # Also check if argument contains image file pattern (for paths with spaces)
            if echo "$arg" | grep -qi "\.\(jpg\|jpeg\|png\|gif\|webp\|bmp\|tiff\)"; then
                image_files+=("$arg")
            fi
            args+=("$arg")
        fi
    done

    # If Ralph mode is enabled, create Ralph loop state file and add --print flag
    if [[ "$ralph_mode" == "true" ]]; then
        local prompt_args=()
        local found_prompt=false

        # Extract the prompt (everything after flags, or the last argument)
        for arg in "${args[@]}"; do
            if [[ ! "$arg" =~ ^-- ]] && [[ ! "$arg" =~ ^- ]]; then
                prompt_args+=("$arg")
                found_prompt=true
            fi
        done

        if [[ "$found_prompt" == "true" ]]; then
            local prompt="${prompt_args[*]}"
            local promise="${ralph_completion_promise:-COMPLETE}"

            # Create Ralph loop state file
            create_ralph_state_file "$prompt" "$ralph_max_iterations" "$promise"
            
            log_info "🔄 Ralph Wiggum mode enabled (max: $ralph_max_iterations iterations, promise: $promise)"
            log_info "   State file created: .claude/ralph-loop.local.md"
            
            # Add --print flag to make claude process the prompt immediately
            # The Ralph stop hook will intercept when claude tries to exit
            # Insert --print at the beginning of args (before the prompt)
            args=("--print" "${args[@]}")
        else
            log_warning "Ralph mode enabled but no prompt found - use: $WRAPPER_NAME --ralph \"your prompt\""
        fi
    fi

    # Export processed arguments
    PROCESSED_ARGS=("${args[@]}")
    IMAGE_FILES=("${image_files[@]}")
    SKIP_TRANSLATED="$skip_translated"
}

# Check if this is a non-API call (version, help, etc.)
is_info_call() {
    local args=("$@")

    for arg in "${args[@]}"; do
        if [[ "$arg" =~ ^--(version|help|update|list)$ ]]; then
            return 0
        fi
    done

    return 1
}

# Image detection and routing
should_route_to_vision() {
    if [[ ${#IMAGE_FILES[@]} -gt 0 ]]; then
        log_info "Detected image files: ${IMAGE_FILES[*]}"

        # Check if current wrapper supports vision
        if [[ "${SUPPORTS_VISION:-false}" == "true" ]]; then
            log_info "Current wrapper supports vision, keeping here"
            return 1
        fi

        # Check if vision wrapper is available
        local vision_wrapper="${VISION_WRAPPER:-glm-prism-local}"

        # Check multiple possible locations
        local wrapper_locations=(
            "$HOME/.local/bin/$vision_wrapper"
            "/usr/local/bin/$vision_wrapper"
            "/usr/bin/$vision_wrapper"
            "$(which "$vision_wrapper" 2>/dev/null || true)"
        )

        for location in "${wrapper_locations[@]}"; do
            if [[ -n "$location" ]] && [[ -f "$location" ]] && [[ -x "$location" ]]; then
                log_info "Routing to vision wrapper: $vision_wrapper ($location)"
                VISION_WRAPPER_PATH="$location"
                return 0
            fi
        done

        log_warning "Image files detected but vision wrapper '$vision_wrapper' not found"
        log_warning "Install $vision_wrapper or set VISION_WRAPPER environment variable"
    fi

    return 1
}

# Route to vision wrapper
route_to_vision() {
    local vision_wrapper="${VISION_WRAPPER:-glm-prism-local}"
    local wrapper_path="${VISION_WRAPPER_PATH:-$vision_wrapper}"

    log_info "Routing to vision wrapper: $vision_wrapper"
    log_info "Using wrapper at: $wrapper_path"

    # Reconstruct arguments with original --skip if it was translated
    local reconstructed_args=()
    for arg in "$@"; do
        if [[ "$arg" == "--dangerously-skip-permissions" ]] && [[ "$SKIP_TRANSLATED" == "true" ]]; then
            reconstructed_args+=("--skip")
        else
            reconstructed_args+=("$arg")
        fi
    done

    exec "$wrapper_path" "${reconstructed_args[@]}"
}

# Service management (override in child scripts)
start_services() {
    log_debug "No services to start (override start_services if needed)"
    return 0
}

stop_services() {
    log_debug "No services to stop (override stop_services if needed)"
    return 0
}

# Cleanup handler
cleanup() {
    local exit_code=$?

    log_debug "Cleaning up..."

    # Stop services
    stop_services

    # Save conversation metadata
    if [[ -d "$WRAPPER_DATA_DIR" ]]; then
        echo "$(date -Iseconds)" > "$WRAPPER_DATA_DIR/last-used"
        log_debug "Saved last-used timestamp"
    fi

    # Log exit
    if [[ $exit_code -eq 0 ]]; then
        log_success "Wrapper completed successfully"
    else
        log_error "Wrapper exited with code: $exit_code"
    fi

    return $exit_code
}

# Setup cleanup traps
setup_cleanup() {
    trap cleanup EXIT INT TERM
    log_debug "Cleanup handlers installed"
}

# Main wrapper execution
execute_wrapper() {
    local start_time=$(date +%s)

    # Initialize
    init_wrapper_data
    process_arguments "$@"

    # Check for info calls
    if is_info_call "${PROCESSED_ARGS[@]}"; then
        log_debug "Info call detected, skipping service startup"
        claude "${PROCESSED_ARGS[@]}"
        return $?
    fi

    # Check image routing BEFORE starting services
    if should_route_to_vision; then
        route_to_vision "$@"
        # exec replaces current process, so this line won't be reached if routing happens
    fi

    # Start services
    start_services

    # Setup cleanup
    setup_cleanup

    # Execute Claude Code
    log_info "Starting Claude Code with $WRAPPER_NAME configuration..."

    # Check if we need to handle images specially
    if [[ ${#IMAGE_FILES[@]} -gt 0 ]] && [[ "${SUPPORTS_VISION:-false}" != "true" ]]; then
        log_warning "⚠️  Image files detected but wrapper doesn't support vision"
        log_warning "   Images may not be processed correctly by $WRAPPER_NAME"
        log_warning "   Consider using: glm-prism-local for image analysis"
    fi

    claude "${PROCESSED_ARGS[@]}"

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log_debug "Execution completed in ${duration}s"
}

# Create Ralph loop state file
create_ralph_state_file() {
    local prompt="$1"
    local max_iterations="$2"
    local completion_promise="$3"
    
    # Create .claude directory if it doesn't exist
    mkdir -p .claude
    
    # Quote completion promise for YAML if it contains special chars or is not null
    if [[ -n "$completion_promise" ]] && [[ "$completion_promise" != "null" ]]; then
        completion_promise_yaml="\"$completion_promise\""
    else
        completion_promise_yaml="null"
    fi
    
    # Create state file (similar to setup-ralph-loop.sh)
    cat > .claude/ralph-loop.local.md <<EOF
---
active: true
iteration: 1
max_iterations: $max_iterations
completion_promise: $completion_promise_yaml
started_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
---

$prompt
EOF
    
    log_debug "Created Ralph loop state file: .claude/ralph-loop.local.md"
}

# Export functions for child scripts
export -f log_info log_success log_warning log_error log_debug
export -f init_wrapper_data process_arguments is_info_call create_ralph_state_file
export -f should_route_to_vision route_to_vision
export -f start_services stop_services cleanup setup_cleanup execute_wrapper

# If script is sourced, don't execute
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    log_error "Base wrapper should be sourced, not executed directly"
    exit 1
fi
export -f init_wrapper_data process_arguments is_info_call create_ralph_state_file
