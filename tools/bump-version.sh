#!/usr/bin/env bash
# สร้าง assets/js/version.js และซิงก์ชื่อแคชของ Service Worker
# เลข build = จำนวนคอมมิตใน git จึงเพิ่มขึ้นเองทุกครั้งที่มีการอัปเดต
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD=$(git rev-list --count HEAD)
COMMIT=$(git rev-parse --short HEAD)
DATE=$(git log -1 --format=%cd --date=format:%Y-%m-%d)

cat > assets/js/version.js <<VERSION
/* ------------------------------------------------------------------
 * version.js — เลขเวอร์ชันของแอป (สร้างอัตโนมัติ อย่าแก้ด้วยมือ)
 * เลข build นับจากจำนวนคอมมิตใน git
 * ------------------------------------------------------------------ */
window.KH_VERSION = { build: ${BUILD}, commit: '${COMMIT}', date: '${DATE}' };
VERSION

# ผูกชื่อแคชกับเลข build เพื่อให้เครื่องที่เคยเปิดได้ไฟล์ใหม่เสมอ
sed -i.bak "s/const CACHE = '[^']*'/const CACHE = 'khaohom-writing-b${BUILD}'/" sw.js && rm -f sw.js.bak

echo "เวอร์ชัน 1.0.${BUILD} (${COMMIT} · ${DATE})"
