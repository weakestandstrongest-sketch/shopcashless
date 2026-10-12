# ShopCashless — このお店、何で払える？

お店の名前を入れると、**その店舗で使えるキャッシュレス決済**がすぐわかる Web アプリです。
iPhone の Safari で URL を開くだけで使えます（Mac・App Store 不要）。

## できること

- **店名で探す**：「マック」「スタバ」「ファミマ」など略称・ひらがなでもOK。近くの店舗を地図とリストに表示
- **場所を指定**：「マック 渋谷」のように地名をつけると、その周辺の店舗を検索
- **範囲を選ぶ**：検索ボタン左のメニューで半径 300m〜20km を選択（選んだ範囲は地図に点線の円で表示・次回も記憶）
- **支払い方法で探す**：「PayPay」「交通系IC」「nanaco」などと入れると、それが使えそうな近くのお店を表示
- **どの店舗かわかる表示**：店名（○○店）に加えて「渋谷駅 徒歩3分 ・ 渋谷区宇田川町」のような目印を表示。
  地図データに店名が登録されていない店舗でも、駅と町名で区別できます
  （町名は [国土地理院の逆ジオコーダー](https://maps.gsi.go.jp/development/api.html) で取得、つながらないときは Nominatim）
- **地図に無いお店を追加**：地図の「＋ お店を追加」で、地図データ（OpenStreetMap）に未登録のお店を自分で登録できる（この端末に保存）。
  チェーン名で登録すればチェーンの目安も表示される
- **店舗ごとに確認**：同じチェーンでも店舗で違うことがあるので、店舗をタップすると
  - Google マップ / Apple マップでその店舗を開ける
  - 支払い方法ごとに「使えた／使えず」を記録できる（この端末に保存）

### 情報の出どころ（優先度の高い順）

| 表示 | 中身 |
| --- | --- |
| 自分 | 自分が記録した「使えた／使えず」 |
| 店舗 | [OpenStreetMap](https://www.openstreetmap.org/) に登録されている、その店舗の `payment:*` 情報 |
| 自分（チェーン） | チェーンの検索結果カードの「このチェーン全体の情報を自分で直す・追加する」で記録した内容。そのチェーンの全店舗に反映 |
| 目安 | 主要チェーン（`js/chains.js`）の公開情報をもとにした共通の目安。店舗によって異なる場合あり |

収録チェーン（23）：マクドナルド、スターバックス、セブン-イレブン、ローソン、ファミリーマート、すき家、松屋、
ガスト、バーミヤン、ジョナサン、しゃぶ葉、夢庵、サイゼリヤ、吉野家、ドトール、コメダ珈琲店、モスバーガー、
ケンタッキー、CoCo壱番屋、はま寿司、なか卯、くら寿司、スシロー

店舗検索・地図は OpenStreetMap（Overpass API / Nominatim）を使っているので、**API キーも料金も不要**です。

## iPhone で使う（GitHub Pages で公開）

1. GitHub のこのリポジトリで **Settings → Pages** を開く
2. **Build and deployment → Source** を「Deploy from a branch」にする
3. **Branch** でこのアプリのブランチ（main にマージ済みなら `main`）と `/ (root)` を選んで **Save**
4. 1〜2 分で `https://weakestandstrongest-sketch.github.io/shopcashless/` が使えるようになる
5. iPhone の Safari でその URL を開き、共有ボタン →「**ホーム画面に追加**」でアプリのように使える

位置情報を使うので、最初に「位置情報の利用を許可」してください（HTTPS の GitHub Pages なら動きます）。

`https://…/shopcashless/?q=マック` のように `?q=` をつけると、開いた瞬間にその検索をします。

## 開発

ビルド不要の素の HTML / CSS / JavaScript です。

```sh
npm start   # http://localhost:8080 で確認（python3 の簡易サーバー）
npm test    # ロジックのテスト（Node.js 18 以上）
```

| ファイル | 役割 |
| --- | --- |
| `index.html`, `css/style.css` | 画面 |
| `js/app.js` | 画面の動き（検索・地図・詳細） |
| `js/core.js` | 入力の解釈・表記ゆれ吸収・情報の統合（テスト対象） |
| `js/overpass.js` | OpenStreetMap からの店舗検索・地名検索 |
| `js/payments.js` | 支払い方法の一覧（OSM タグとの対応つき） |
| `js/chains.js` | チェーンごとの支払い方法の目安。**チェーンの追加・修正はここ** |
| `js/storage.js` | 自分の記録の保存（localStorage） |
| `tests/` | `npm test` で実行するテスト |
| `vendor/leaflet/` | 地図ライブラリ [Leaflet](https://leafletjs.com/) 1.9.4（BSD-2-Clause） |

### 更新するとき

iPhone の Safari に古いファイルが残らないよう、`index.html` と `js/*.js` の読み込みすべてに `?v=8` のような
バージョンを付けています。ファイルを変更したら、すべての `?v=` を同じ新しい数字に上げてください
（そろっていないと `npm test` が失敗します）。画面の一番下に今のバージョンが表示されます。

### チェーンを追加するには

`js/chains.js` の `CHAINS` に 1 件足します。`aliases` に略称、`pattern` に OpenStreetMap 上の店名の正規表現、
`payments` に `yes`（使える）/ `some`（一部店舗）/ `no`（使えない）を書きます。支払い方法の ID は `js/payments.js` を参照。

## 今後のアイデア

- 記録をみんなで共有する（サーバー or OpenStreetMap への反映）
- Google Places API（キーが必要）で店舗情報を補強
- チェーンの追加（吉野家・ドトール・ユニクロ など）
