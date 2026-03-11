---
name: experiment
description: 実験帳（仮説→検証→結果の管理）
---

# /experiment — 実験帳

## 概要
仮説 → 方法 → 結果 → 結論のサイクルを記録・管理するスキル。
Deliberate Practice の「弱点に絞って検証する」考え方を支援。

## 動作

### /experiment new — 新規実験
```
🧪 新しい実験を記録します。

1️⃣ 仮説は何ですか？
   （例: 「ダブル配列は trie より検索が速い」）
```

```
2️⃣ どうやって検証しますか？
   （例: 「10万語の辞書で検索ベンチマークを比較する」）
```

→ experiments/{id}.json に保存

### /experiment complete {id} — 実験完了
```
🧪 実験「{hypothesis}」の結果を記録します。

3️⃣ 結果は何でしたか？

4️⃣ 結論は？次に何をしますか？
```

→ 結果を保存。学びを /log と /review に連携:
```
✅ 実験を完了しました。
📝 復習アイテムに追加: 「{conclusion の要約}」
```

### /experiment list — 一覧
```
🧪 実験帳

未完了:
  ⏳ {id}: {hypothesis} ({createdAt})

完了:
  ✅ {id}: {hypothesis} → {conclusion の要約}
```

## 引数
- `project`: プロジェクト名
- `new`: 新規実験
- `complete {id}`: 実験完了
- `list`: 一覧表示

## 設計原則
- **仮説駆動**: 漠然と試すのではなく、仮説を立ててから検証
- **復習連携**: 実験の結論を復習アイテムに自動登録
- **未完了の可視化**: 放置された実験を見えるようにする
