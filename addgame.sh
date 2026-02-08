#!/bin/bash

# Usage:
# ./addgame.sh "Game Name" path/to/file.html

GAME_NAME="$1"
SOURCE_FILE="$2"

if [ -z "$GAME_NAME" ] || [ -z "$SOURCE_FILE" ]; then
  echo "Usage: ./addgame.sh \"Game Name\" file.html"
  exit 1
fi

# your long random string folder
BASE="games/a0d702b41fb4e59f9372b1e0e9ea8e2e2088eb2ce730472976bc496e6834d5d0"

# make safe folder name (lowercase, no spaces)
FOLDER=$(echo "$GAME_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' )

mkdir -p "$BASE/$FOLDER"

cp "$SOURCE_FILE" "$BASE/$FOLDER/index.html"

echo "✅ Game added at:"
echo "$BASE/$FOLDER/index.html"
#!/bin/bash

# Usage:
# ./addgame.sh "Game Name" path/to/file.html

GAME_NAME="$1"
SOURCE_FILE="$2"

if [ -z "$GAME_NAME" ] || [ -z "$SOURCE_FILE" ]; then
  echo "Usage: ./addgame.sh \"Game Name\" file.html"
  exit 1
fi

# your long random string folder
BASE="games/a0d702b41fb4e59f9372b1e0e9ea8e2e2088eb2ce730472976bc496e6834d5d0"

# make safe folder name (lowercase, no spaces)
FOLDER=$(echo "$GAME_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' )

mkdir -p "$BASE/$FOLDER"

cp "$SOURCE_FILE" "$BASE/$FOLDER/index.html"

echo "✅ Game added at:"
echo "$BASE/$FOLDER/index.html"
#!/bin/bash

# Usage:
# ./addgame.sh "Game Name" path/to/file.html

GAME_NAME="$1"
SOURCE_FILE="$2"

if [ -z "$GAME_NAME" ] || [ -z "$SOURCE_FILE" ]; then
  echo "Usage: ./addgame.sh \"Game Name\" file.html"
  exit 1
fi

# your long random string folder
BASE="games/a0d702b41fb4e59f9372b1e0e9ea8e2e2088eb2ce730472976bc496e6834d5d0"

# make safe folder name (lowercase, no spaces)
FOLDER=$(echo "$GAME_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' )

mkdir -p "$BASE/$FOLDER"
GAME_NAME="$1"
SOURCE_FILE="$2"

if [ -z "$GAME_NAME" ] || [ -z "$SOURCE_FILE" ]; then
  echo "Usage: ./addgame.sh \"Game Name\" file.html"
  exit 1
fi

# your long random string folder
BASE="games/a0d702b41fb4e59f9372b1e0e9ea8e2e2088eb2ce730472976bc496e6834d5d0"
#!/bin/bash

# Usage:
# ./addgame.sh "Game Name" path/to/file.html

GAME_NAME="$1"
SOURCE_FILE="$2"

if [ -z "$GAME_NAME" ] || [ -z "$SOURCE_FILE" ]; then
  echo "Usage: ./addgame.sh \"Game Name\" file.html"
  exit 1
fi

# your long random string folder
BASE="games/a0d702b41fb4e59f9372b1e0e9ea8e2e2088eb2ce730472976bc496e6834d5d0"

# make safe folder name (lowercase, no spaces)
FOLDER=$(echo "$GAME_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' )

mkdir -p "$BASE/$FOLDER"

cp "$SOURCE_FILE" "$BASE/$FOLDER/index.html"

echo "✅ Game added at:"
echo "$BASE/$FOLDER/index.html"

