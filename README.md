# Money Life

แอปบันทึกรายรับรายจ่ายส่วนตัว (PWA) แบ่งเงินเดือน 40/20/20/20 ซิงค์กับ Google Sheet ผ่าน Apps Script แจ้งเตือนผ่าน LINE

- ไฟล์ตัวแอปอยู่ที่ root (`index.html`, `sw.js`, `manifest.webmanifest`, ไอคอน) — GitHub Pages เปิดจากตรงนี้
- `brand/` — โลโก้และไอคอนต้นฉบับ
- `apps-script/Code.gs` — หลังบ้าน วางใน Apps Script ของ Google Sheet
- `docs/SETUP.md` — วิธีติดตั้งและอัปเดตแต่ละเวอร์ชัน
- `docs/handoff/` — สรุปงานจาก Chat ที่ส่งมาให้ Claude Code ทำ
- `CLAUDE.md` — บริบทสำหรับ Claude Code

## วิธีทำงาน
1. คิด/หาไอเดีย/ตัดสินใจ ใน Claude Chat (Project "Upgrade Life")
2. ได้ข้อสรุปแล้ว พิมพ์ "สรุปส่ง Claude Code" → ได้ไฟล์ handoff
3. เปิด repo `money4` ใน Claude Code แล้วสั่ง "ทำตาม handoff ล่าสุด"
4. Claude Code แก้โค้ด ทดสอบ commit แล้วเขียนผลกลับในไฟล์ handoff
