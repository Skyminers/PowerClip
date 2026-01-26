import os
import sqlite3
from datetime import datetime
from PIL import Image

from logger import logger
from utils import get_md5

DATA_PATH = "../data"
    
class Database:
    
    def __init__(self, data_path : str):
        """
        解析路径并创建文件夹
        Args:
            data_path (str, optional): 数据存放路径. Defaults to DATA_PATH.
        """
        self.img_path = os.path.join(data_path, "images")
        self.db_path = os.path.join(data_path, "history.db")
        if not os.path.exists(self.img_path):
            os.makedirs(self.img_path)
        
        self.conn = sqlite3.connect(self.db_path)
        self.init_database()
        self.last_hash = None
        
    def init_database(self) -> None:
        """
        初始化数据库，创建 history 表
        """
        c = self.conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS history
                    (id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT,
                    content TEXT,
                    hash TEXT UNIQUE, 
                    created_at TEXT)''')
        self.conn.commit()
    
    def save_image_to_db(self, image: Image.Image) -> bool:
        data_hash = get_md5(image.tobytes())
        filepath = os.path.join(self.img_path, f"{data_hash}.png")
        
        if self._save_to_db(c_type="image", content=filepath, data_hash=data_hash):
            if not os.path.exists(filepath):
                image.save(filepath, "PNG")
            return True
        else:
            return False
        
    def save_text_to_db(self, text: str) -> bool:
        return self._save_to_db(c_type="text", content=text, data_hash=get_md5(text))
    
    def _save_to_db(self, c_type: str, content: str, data_hash: str) -> bool:
        """
        保存记录到数据库，如果已存在则更新时间
        Args:
            c_type: 类型标识，如 'text' 或 'image'
            content: 文本内容 或 图片文件路径
            data_hash: 内容的 MD5 哈希
        Returns:
            True 表示操作成功, False 表示失败
        """
        if self.last_hash == data_hash:
            return True
        self.last_hash = data_hash
            
        c = self.conn.cursor()
        
        # 首先检查是否已存在
        c.execute("SELECT id, created_at FROM history WHERE hash = ?", (data_hash,))
        existing = c.fetchone()
        
        if existing:
            # 已存在，更新时间
            record_id, old_time = existing
            new_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            c.execute("UPDATE history SET created_at = ? WHERE id = ?", 
                    (new_time, record_id))
            self.conn.commit()
            
            # 日志：显示更新时间
            display_content = self._format_display_content(c_type, content.strip(), data_hash)
            logger.info(f"更新记录时间: [{c_type}] {display_content}... (原时间: {old_time})")
            return True
        else:
            # 不存在，插入新记录
            try:
                display_content = self._format_display_content(c_type, content.strip(), data_hash)
                c.execute("INSERT INTO history (type, content, hash, created_at) VALUES (?, ?, ?, ?)",
                        (c_type, content, data_hash, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
                self.conn.commit()
                logger.info(f"新增记录: [{c_type}] {display_content}...")
                return True
            except sqlite3.Error as e:
                logger.error(f"数据库操作失败: {e}")
                return False

    def _format_display_content(self, c_type, content, data_hash):
        """格式化显示内容"""
        if c_type == "text":
            return content[:30].replace('\r', '').replace('\n', ' ')
        else:
            return f"Image {data_hash}.png"

database = Database(DATA_PATH)