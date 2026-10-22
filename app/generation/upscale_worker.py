"""Private subprocess entry point for the torch upscaler."""
import sys
from PIL import Image
from .upscale import upscale4x

if __name__ == "__main__":
    with Image.open(sys.argv[1]) as source:
        upscale4x(source, tile=int(sys.argv[3]), pad=int(sys.argv[4])).save(sys.argv[2])
