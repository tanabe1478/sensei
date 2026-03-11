---
name: progress
description: 学習進捗ダッシュボード
---

# /progress — 学習進捗ダッシュボード

## 概要
プロジェクト別の学習状況を俯瞰するスキル。

## 動作

### /progress — ダッシュボード表示
```
📊 学習進捗 — {project}

📅 学習日数: {N}日
📝 学習ログ: {N}件
🧠 復習アイテム: {total}件
  ├ 復習済み: {completed}件
  ├ 今日の復習: {pending}件
  └ 期限超過: {overdue}件
🧪 実験: {total}件（未完了: {pending}件）
📛 誤り: {total}件

最終学習日: {date}
```

### /progress all — 全プロジェクト
```
📊 全プロジェクト進捗

  {project1}: {N}日学習, {N}件復習待ち
  {project2}: {N}日学習, {N}件復習待ち
```

## 引数
- `project`: プロジェクト名（省略時はデフォルト）
- `all`: 全プロジェクト表示
