#!/bin/bash

# Text-to-Speech App Build Script
# This script builds the macOS Text-to-Speech application

set -e  # Exit on error

echo "🚀 Building Text-to-Speech App..."
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Swift is installed
if ! command -v swift &> /dev/null; then
    echo -e "${RED}❌ Swift is not installed. Please install Xcode.${NC}"
    exit 1
fi

# Print Swift version
echo -e "${GREEN}✓ Swift version:${NC}"
swift --version
echo ""

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf .build
echo -e "${GREEN}✓ Clean complete${NC}"
echo ""

# Build the application
echo "🔨 Building application..."
swift build -c release

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build successful!${NC}"
    echo ""
    
    # Create app bundle structure
    echo "📦 Creating app bundle..."
    
    APP_NAME="TextToSpeechApp"
    BUILD_DIR=".build/release"
    APP_BUNDLE="$APP_NAME.app"
    CONTENTS_DIR="$APP_BUNDLE/Contents"
    
    # Remove old app bundle if exists
    rm -rf "$APP_BUNDLE"
    
    # Create directory structure
    mkdir -p "$CONTENTS_DIR/MacOS"
    mkdir -p "$CONTENTS_DIR/Resources"
    
    # Copy executable
    cp "$BUILD_DIR/$APP_NAME" "$CONTENTS_DIR/MacOS/"
    
    # Copy Info.plist
    if [ -f "Info.plist" ]; then
        cp "Info.plist" "$CONTENTS_DIR/"
        echo -e "${GREEN}✓ Info.plist copied${NC}"
    fi
    
    # Copy entitlements if exists
    if [ -f "TextToSpeechApp.entitlements" ]; then
        cp "TextToSpeechApp.entitlements" "$CONTENTS_DIR/Resources/"
        echo -e "${GREEN}✓ Entitlements copied${NC}"
    fi
    
    # Create PkgInfo file
    echo "APPL????" > "$CONTENTS_DIR/PkgInfo"
    
    # Make executable
    chmod +x "$CONTENTS_DIR/MacOS/$APP_NAME"
    
    # Code sign the app (ad-hoc signing for local use)
    echo "🔐 Code signing app..."
    codesign --force --deep --sign - "$APP_BUNDLE"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ App signed successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  Code signing failed, app may not run properly${NC}"
    fi
    
    echo -e "${GREEN}✓ App bundle created: $APP_BUNDLE${NC}"
    echo ""
    
    # Print instructions
    echo "📋 Next steps:"
    echo "============="
    echo "1. To run the app directly:"
    echo "   ${YELLOW}open $APP_BUNDLE${NC}"
    echo ""
    echo "2. To install to Applications:"
    echo "   ${YELLOW}cp -r $APP_BUNDLE /Applications/${NC}"
    echo ""
    echo "3. To run tests:"
    echo "   ${YELLOW}swift test${NC}"
    echo ""
    echo "4. To run in development mode:"
    echo "   ${YELLOW}swift run${NC}"
    echo ""
    
else
    echo -e "${RED}❌ Build failed!${NC}"
    echo "Please check the error messages above."
    exit 1
fi

echo "✨ Done!"