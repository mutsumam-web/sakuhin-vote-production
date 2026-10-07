# Platform Usage Monitoring Policy v1.0

## 1. 目的

GitHub / Cloudflare等の無料枠・利用量を、プロジェクトごとに重複計測せず中央集約する。

## 2. Single Source of Truth

正式な利用量の唯一の計測元は Platform Usage Monitor とする。

- Web: https://mutsumam-web.github.io/sakuhin-vote-production/platform-usage/
- 全体データ: https://raw.githubusercontent.com/mutsumam-web/sakuhin-vote-production/main/platform-usage/latest.json
- repo別内訳: https://raw.githubusercontent.com/mutsumam-web/sakuhin-vote-production/main/platform-usage/repositories.json

各プロジェクトは中央データを読み取るだけとし、GitHub / Cloudflare利用量を独自に再集計しない。

## 3. GitHub Actions

- 無料枠判定は個別repoではなくGitHub個人アカウント全体で行う。
- GitHub公式 Billing Usage API のアカウント実測値だけを正式値とする。
- repo別内訳もBilling Usage APIの repositoryName を使用する。
- workflow run時間から算出した概算値を正式値として表示しない。
- 実測値を取得できない場合は「未取得」と表示し、0や概算へフォールバックしない。
- Fine-grained PATは All repositories を対象とし、User permissions の Plan: Read を付与する。
- PATは `PLATFORM_USAGE_GITHUB_TOKEN` として中央collectorだけが保持する。

## 4. Cloudflare

- Workers / D1 / R2はCloudflareアカウント全体の利用量を正式値とする。
- Workersは日次Requests、D1は日次Rows Read / Rows WrittenとStorage、R2はStorageを表示する。
- 個別Worker / 個別DB / 個別Bucketの値を無料枠全体の残量として扱わない。

## 5. データ品質

- 実測不能は「未取得」。
- 欠損値を0として扱わない。
- 70%以上を注意、90%以上を警告の標準閾値とする。
- collectedAtを必ず保持し、古いスナップショットは更新時刻を明示する。

## 6. Secret

- API token / PAT / Secretを公開JSON、Web、ログ、各プロジェクトへ複製しない。
- 公開するのは集計済み数値、状態、repo名等の非Secret情報のみ。
- GitHub用PATとCloudflare tokenは中央collector以外で利用量監視目的に複製しない。

## 7. 各プロジェクトの実装ルール

- 各プロジェクトのDashboardへ利用量を表示する場合、中央JSONを読み取る。
- 各プロジェクト内に新しい利用量collectorを作らない。
- 利用量の上限値・判定ロジックをプロジェクトごとに独自変更しない。
- 中央schema変更時は中央側を先に後方互換で更新し、その後各クライアントを更新する。
- 障害時もアプリ本体の主要機能を止めない。利用量表示だけを「未取得」にする。

## 8. ホスティング

Platform Usage Monitorはアプリとして独立させる。現在の公開ホストは
`sakuhin-vote-production/platform-usage/` を使用するが、各プロジェクトからは中央データ契約だけを参照し、作品展固有ロジックへ依存しない。

将来専用repo `platform-usage-monitor` を作成した場合も、schemaと利用規約を維持して移行する。
