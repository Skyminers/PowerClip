import time
import os
import pyperclip
from PIL import ImageGrab, Image

from database import database
from utils import get_md5
from logger import logger

# === 配置 ===
CHECK_INTERVAL: float = 1.0 

def monitor() -> None:
    """主监控循环"""
    logger.info("PowerClip Started")
    
    while True:
        try:
            clipboard_content = ImageGrab.grabclipboard()
            if isinstance(clipboard_content, Image.Image):
                database.save_image_to_db(clipboard_content)
            else:
                database.save_text_to_db(pyperclip.paste())

            time.sleep(CHECK_INTERVAL)
            
        except Exception as e:
            logger.error(f"Failed to check clipboard, due to {e}")
            time.sleep(0.5)

if __name__ == "__main__":
    monitor()