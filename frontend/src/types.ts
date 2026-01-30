export interface ClipboardItem {
  id: number;
  item_type: string;
  content: string;
  hash: string;
  created_at: string;
}

export interface HistoryItem {
  id: number;
  type: string;
  content: string;
  hash: string;
  created_at: string;
}
