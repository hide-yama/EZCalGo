# EZCalGo (イジカルゴ)

カレンダーベースのタスクスケジューリングWebアプリ。タスク名と所要時間を入力すると連続した時間割を自動計算し、Googleカレンダーへ一括登録できる。

## プロジェクト基本情報

- **リポジトリ**: https://github.com/hide-yama/EZCalGo
- **ライセンス**: MIT (Copyright 2025 hide-yama)
- **公開URL**: https://hide-yama.github.io/EZCalGo/
- **代替URL**: www.doyori.com/ezcalgo (FTPデプロイ)
- **初期構築ツール**: Bolt (bolt-vite-react-ts テンプレート)

## 技術スタック

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| UIライブラリ | React | 18.2.0 |
| 言語 | TypeScript | 5.2.2 (strict mode) |
| ビルドツール | Vite | 5.1.6 |
| CSSフレームワーク | Tailwind CSS | 3.4.1 |
| Google認証 | @react-oauth/google | 0.12.1 |
| アイコン | lucide-react | 0.358.0 |
| Node.js (CI) | Node.js | 20 |

## 開発コマンド

```bash
npm run dev        # 開発サーバー起動 (Vite)
npm run build      # TypeScriptチェック + ビルド (tsc && vite build)
npm run preview    # ビルド結果プレビュー
npm run lint       # ESLint実行
npm run deploy:gh  # GitHub Pagesへデプロイ (gh-pages -d dist)
npm run deploy:ftp # FTPサーバーへデプロイ (node deploy.js)
```

## アーキテクチャ

### ファイル構成

```
project_20250318/
├── src/
│   ├── App.tsx            # アプリ全体のロジックとUI (約590行、単一コンポーネント)
│   ├── main.tsx           # Reactエントリポイント (StrictMode + createRoot)
│   ├── index.css          # Tailwind CSSディレクティブ + カスタムユーティリティ
│   └── vite-env.d.ts      # Vite型定義参照
├── public/
│   └── favicon.svg        # 渦巻き型アイコン (黄色 #F59E0B)
├── dist/                  # ビルド出力 (.gitignoreに含まれるがローカルに存在)
├── .bolt/                 # Bolt初期構築設定
│   ├── config.json        # テンプレート: bolt-vite-react-ts
│   └── prompt             # Bolt用プロンプト (Tailwind + Lucide前提)
├── .github/workflows/
│   └── deploy.yml         # GitHub Pages自動デプロイ
├── deploy.js              # FTPデプロイスクリプト (basic-ftp使用)
├── .env                   # 環境変数 (Google Client ID, FTP認証情報)
├── vite.config.ts         # Vite設定 (base path環境分岐あり)
├── tailwind.config.js     # カスタムアニメーション定義
├── tsconfig.json          # TS設定ルート (app/node参照)
├── tsconfig.app.json      # アプリ用TS設定 (ES2020, strict)
├── tsconfig.node.json     # ツール用TS設定 (ES2022)
├── eslint.config.js       # ESLint flat config
├── postcss.config.js      # PostCSS (tailwindcss + autoprefixer)
├── index.html             # HTMLテンプレート (lang="ja")
├── package.json           # 依存関係・スクリプト定義
└── LICENSE                # MIT License
```

### コンポーネント構造

アプリは**単一コンポーネント設計**。`App.tsx` 内に2つのコンポーネントがある:

- **`App`** — `GoogleOAuthProvider` でラップするだけのルートコンポーネント
- **`AppContent`** — 全ロジック・全UIを含むメインコンポーネント

コンポーネント分割やカスタムフック抽出は行われていない。

### 状態管理

すべて `useState` による局所ステート管理。外部状態管理ライブラリは未使用。

| State | 型 | 用途 |
|-------|-----|------|
| `input` | string | ユーザー入力テキスト |
| `output` | string | 計算結果テキスト |
| `error` | string | エラーメッセージ |
| `processingTime` | string | 処理時間表示 |
| `copySuccess` / `copyInputSuccess` | boolean | コピー成功フィードバック (2秒間表示) |
| `accessToken` | string \| null | Google OAuthアクセストークン |
| `userEmail` / `userAvatar` | string \| null | Googleユーザー情報 |
| `selectedDate` | Date | 開始日 |
| `selectedHour` / `selectedMinute` | string | 開始時刻 (HH / MM) |
| `isAddingToCalendar` | boolean | カレンダー追加中ローディング |
| `textareaRef` | ref | textarea DOM参照 (高さ自動調整用) |

## コアロジック詳細

### 1. スケジュール計算 (`calculateSchedule`)

**入力フォーマット**: 1行につき `タスク名 所要時間(分)` (半角・全角スペース対応)

```
読書 30
ストレッチ 15
メールチェック 20
```

**処理フロー**:
1. 各行を正規表現 `/^(.+)[\s　](\d+)$/` でパース
2. 開始日時 (`selectedDate` + `selectedHour` + `selectedMinute`) から分単位で累積加算
3. 24時間 (1440分) を超えた場合、日付を繰り上げて新しい日付ヘッダーを挿入
4. 最終行に `HH:MM 終了` を追加

**出力フォーマット**:
```
2025/03/18
09:00 読書
09:30 ストレッチ
09:45 メールチェック
10:05 終了
```

**日付フォーマット**: `ja-JP` ロケール (`YYYY/MM/DD`)

**既知の制限**: 24時間超えの日付繰り上げ処理は、`hours >= 24` チェックがイベント追加時と終了時刻計算時の2箇所にあり、多日にまたがるスケジュールでは期待通り動かない可能性がある。

### 2. Google認証

- `@react-oauth/google` の `useGoogleLogin` フックを使用
- **スコープ**: `calendar.events`, `userinfo.profile`, `userinfo.email`
- アクセストークンはメモリ上のみ保持 (リロードでログアウト)
- **Client ID**: 環境変数 `VITE_GOOGLE_CLIENT_ID` から取得

### 3. Googleカレンダー追加 (`addToGoogleCalendar`)

- 計算結果 (`output`) テキストをパースしてイベントオブジェクトを構築
- `YYYY/MM/DD` 形式の日付行を検出して `currentDate` を追跡
- 各タスクの終了時刻は「次のタスクの開始時刻」から取得
- `終了` 行はイベントとしては登録しない
- Google Calendar API v3 に対し**逐次的に** POST (バッチAPIは未使用)
- タイムゾーン: `Asia/Tokyo` (UTC+09:00 ハードコード)
- 完了時に `alert()` で通知

### 4. 行の入れ替え (`handleKeyDown`)

- `Cmd + ↑`: 現在行を1行上に移動
- `Cmd + ↓`: 現在行を1行下に移動
- `setTimeout` でカーソル位置を再設定

### 5. テキストエリア自動リサイズ

- `useEffect` で `input` 変更時に `scrollHeight` ベースで高さを再計算
- 最小高さ: 192px

### 6. 初期時刻設定

- 起動時に現在時刻を5分単位に切り上げて初期値にセット
- 「クリア」ボタンでも同様にリセット

## UIデザイン

- **テーマカラー**: 黄色 (yellow-400〜500) をプライマリカラーとして使用
- **レイアウト**: モバイルは1カラム、PC (md以上) は入力/出力の2カラム
- **アニメーション**: `fade-in-out` (コピー成功表示), `gentle-pulse` (定義あるが未使用)
- **アイコン**: lucide-react (Calculator, Trash2, Copy, LogOut, Calendar)
- **ヘッダーロゴ**: SVG渦巻きアイコン (headerにインライン記述)

## デプロイ

### GitHub Pages (メイン)

- **トリガー**: `main` ブランチへのpush、または手動 (workflow_dispatch)
- **ワークフロー**: `.github/workflows/deploy.yml`
- **base path**: `/EZCalGo/` (`GITHUB_ACTIONS` 環境変数で判定)
- **Google Client ID**: ワークフロー内にハードコード
- **プロセス**: checkout → Node.js 20セットアップ → `npm ci` → `npm run build` → upload-pages-artifact → deploy-pages

### FTPデプロイ (代替)

- **コマンド**: `npm run deploy:ftp`
- **スクリプト**: `deploy.js` (basic-ftpライブラリ使用)
- **接続先**: `.env` の `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD`, `FTP_REMOTE_PATH`
- **base path**: `/ezcalgo/` (`NODE_ENV=production` 時)
- **動作**: `dist/` ディレクトリ全体を再帰的にアップロード

### Vite base path の分岐

```
GITHUB_ACTIONS=true  → /EZCalGo/       (GitHub Pages)
NODE_ENV=production  → /ezcalgo/       (FTPサーバー)
それ以外              → /              (ローカル開発)
```

## Git構成

- **ブランチ**: `main` のみ
- **リモート**: `origin` → `https://github.com/hide-yama/EZCalGo.git`
- **コミット数**: 11 (初回コミットから現在まで)
- **注意**: `.env` は `.gitignore` に含まれているが、2コミット目で `.env` をgit追跡から除外する対応がされた。ワークフロー内にはGoogle Client IDがハードコードされている。

## 環境変数

| 変数名 | 用途 | 使用箇所 |
|--------|------|---------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID | App.tsx (ビルド時にバンドル) |
| `FTP_HOST` | FTPサーバーホスト | deploy.js |
| `FTP_USER` | FTPユーザー名 | deploy.js |
| `FTP_PASSWORD` | FTPパスワード | deploy.js |
| `FTP_REMOTE_PATH` | FTPアップロード先パス | deploy.js |

## 開発時の注意点

- アプリ全体が `src/App.tsx` に集約されているため、変更時はこのファイルを中心に確認する
- UIの言語は日本語。エラーメッセージ、ボタンラベル等すべて日本語
- Tailwind CSSのクラスで直接スタイリングしている (外部CSSファイルは `index.css` のみ)
- テストコードは存在しない
- ルーティングなし (SPA単一ページ)
- バックエンドなし (完全クライアントサイド)
- 外部APIへの通信は Google OAuth と Google Calendar API のみ
