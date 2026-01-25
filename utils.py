import hashlib
from typing import Union, Tuple, Optional

def get_md5(data: Union[str, bytes]) -> str:
    """
    生成 MD5 哈希用于去重
    Args:
        data: 可以是字符串(文本)或字节流(图片数据)
    Returns:
        32位十六进制哈希字符串
    """
    # 如果是字符串则编码，如果是 bytes 则直接使用
    payload = data.encode('utf-8') if isinstance(data, str) else data
    return hashlib.md5(payload).hexdigest()
