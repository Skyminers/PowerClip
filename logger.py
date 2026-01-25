import logging
from logging.handlers import RotatingFileHandler

class Logger:
    def __init__(self, name: str, log_file: str, level=logging.INFO):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(level)
        
        if not self.logger.handlers:
            console_format = logging.Formatter('%(levelname)s: %(message)s')
            file_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(pathname)s:%(lineno)d - %(message)s')

            console_handler = logging.StreamHandler()
            console_handler.setFormatter(console_format)
            
            # 单文件最大 5MB, 保留 3 个旧文件
            file_handler = RotatingFileHandler(log_file, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8')
            file_handler.setFormatter(file_format)

            self.logger.addHandler(console_handler)
            self.logger.addHandler(file_handler)

    def get_logger(self) -> logging.Logger:
        return self.logger

logger = Logger(name="ClipLogger", log_file="powerclip.log").get_logger()
