#!/bin/sh

#################################################
# MJ Secure Messaging - Angular Element Build Script
#################################################
#
# Builds the Angular app and bundles output into a single
# JavaScript file for embedding on any web page.
#
# USAGE:
#   ./build_element.sh
#
# OUTPUT:
#   dist/mj-secure-messaging.js
#
# Include on any page:
#   <script src="mj-secure-messaging.js"></script>
#   <mj-secure-messaging api-base-url="https://api.example.com/secure-messaging/api/v1"></mj-secure-messaging>
#
#################################################

set -e

echo "Building MJ Secure Messaging element..."
npx ng build ng-secure-messaging

DIST="dist/ng-secure-messaging/browser"

echo "Bundling output files..."

# Angular 21 application builder outputs to browser/ subdirectory
# with main.js and polyfills.js (no separate runtime/scripts files)
# Wrap each in an IIFE to prevent variable name collisions
{
  echo ";(function(){"; cat "$DIST/polyfills.js"; echo "})();"
  echo ";(function(){"; cat "$DIST/main.js"; echo "})();"
} > dist/mj-secure-messaging.js

# Inject the global styles as a <style> tag via JS
# (so the widget is truly a single-file embed)
CSS_CONTENT=$(cat "$DIST/styles.css" | tr '\n' ' ' | sed "s/'/\\\\'/g")
cat >> dist/mj-secure-messaging.js <<CSSEOF
;(function(){var s=document.createElement('style');s.textContent='${CSS_CONTENT}';document.head.appendChild(s);})();
CSSEOF

SIZE=$(wc -c < dist/mj-secure-messaging.js | tr -d ' ')
echo ""
echo "Build complete: dist/mj-secure-messaging.js ($SIZE bytes)"
echo ""
echo "Usage:"
echo '  <script src="mj-secure-messaging.js"></script>'
echo '  <mj-secure-messaging api-base-url="https://api.example.com/secure-messaging/api/v1"></mj-secure-messaging>'
